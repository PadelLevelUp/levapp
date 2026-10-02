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
 * B-252: nothing here waits on the clock. These tests once took 15–45 s under machine load
 * because of jsdom's `:modal` matching in floating-ui's top-layer check; the shim for that
 * lives in src/test/setup.ts, for every test that renders a popper.
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

beforeEach(() => {
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
