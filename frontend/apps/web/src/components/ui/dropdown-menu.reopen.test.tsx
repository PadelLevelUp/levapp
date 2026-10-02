/**
 * PAD-462 / B-221: a trigger press made while the previous menu is still playing its exit
 * animation opens the menu again, instead of being swallowed.
 *
 * Radix keeps a closing menu's content, and its DismissableLayer's document pointerdown
 * listener, mounted until the exit animation ends. The trigger's toggle opens the menu,
 * then that lingering listener counted the trigger as "outside" and dismissed it again.
 * jsdom plays no animations, and its getComputedStyle is a snapshot where a browser's is
 * live. So the menu node's computed `animationName` is made live here: "enter" while
 * open, "exit" once closed. Presence then waits for an `animationend` that never fires,
 * and the closing window stays open for as long as the test needs it.
 *
 * B-252: nothing here waits on the clock. What made these tests take 15–45 s under machine
 * load was floating-ui's positioning: on every update it asks each ancestor
 * `matches(":modal")` / `matches(":popover-open")` (its top-layer check). jsdom's selector
 * engine (nwsapi 2.2.27) answers `:modal` by re-entering its own `matches` — about
 * 300 ms of CPU per call on a busy machine. jsdom has no top layer
 * (no `showModal`, no popover API), so both pseudo-classes can never match here; the shim
 * below answers them `false` directly and leaves every other selector to jsdom.
 */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./dropdown-menu";

// jsdom has no PointerEvent, and Radix's trigger acts only on a primary-button pointerdown.
if (typeof window.PointerEvent === "undefined") {
  class PointerEvent extends MouseEvent {
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerType = init.pointerType ?? "mouse";
    }
  }
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = PointerEvent;
}

const TOP_LAYER = new Set([":modal", ":popover-open"]);

beforeEach(() => {
  const realMatches = Element.prototype.matches;
  vi.spyOn(Element.prototype, "matches").mockImplementation(function (this: Element, selector: string) {
    return TOP_LAYER.has(selector) ? false : realMatches.call(this, selector);
  });

  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((el, pseudo) => {
    const styles = real(el, pseudo);
    if (el.getAttribute("role") !== "menu") return styles;
    return new Proxy(styles, {
      get(target, key) {
        if (key === "animationName") return el.getAttribute("data-state") === "closed" ? "exit" : "enter";
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  });
});

afterEach(() => vi.restoreAllMocks());

function Menu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger data-testid="trigger">Open</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem data-testid="item">Settings</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const press = (el: Element) => fireEvent.pointerDown(el, { button: 0, ctrlKey: false, pointerType: "mouse" });

// No per-file timeout: 18–93 ms per test at load ~400 (B-252).
describe("DropdownMenu reopened during its exit animation (PAD-462)", () => {
  it("the closing menu lingers, so the window is real", async () => {
    render(<Menu />);
    press(screen.getByTestId("trigger"));
    fireEvent.click(await screen.findByTestId("item"));
    expect(screen.getByRole("menu", { hidden: true })).toHaveAttribute("data-state", "closed");
    expect(screen.getByTestId("trigger")).toHaveAttribute("aria-expanded", "false");
  });

  it("a trigger press inside that window opens the menu", async () => {
    render(<Menu />);
    const trigger = screen.getByTestId("trigger");
    press(trigger);
    fireEvent.click(await screen.findByTestId("item"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0)); // the layer's listener attaches on a timeout
    });

    press(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("data-state", "open");
  });

  it("a trigger press on an open menu still closes it", async () => {
    render(<Menu />);
    const trigger = screen.getByTestId("trigger");
    press(trigger);
    await screen.findByTestId("item");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    press(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
