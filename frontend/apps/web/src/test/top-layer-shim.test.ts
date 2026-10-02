import { describe, expect, it } from "vitest";

/** B-252: the setup's top-layer shim answers exactly two selectors and leaves the rest to jsdom. */
describe("top-layer shim (src/test/setup.ts, B-252)", () => {
  it("answers :modal and :popover-open with false, without asking jsdom", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    expect(el.matches(":modal")).toBe(false);
    expect(el.matches(":popover-open")).toBe(false);
    // jsdom would also say false, but only after ~300 ms of CPU for :modal. Prove the shim
    // answered — without timing anything, which is what B-252 is about.
    expect(String(Element.prototype.matches)).toContain("TOP_LAYER_PSEUDO_CLASSES");
    el.remove();
  });

  it("leaves every other selector to jsdom", () => {
    const el = document.createElement("span");
    el.className = "chip";
    el.setAttribute("data-state", "open");
    document.body.appendChild(el);
    expect(el.matches("span.chip")).toBe(true);
    expect(el.matches('[data-state="open"]')).toBe(true);
    expect(el.matches("div")).toBe(false);
    // An invalid selector still throws, as jsdom's own matches does.
    expect(() => el.matches("::not-a-selector(")).toThrow();
    el.remove();
  });
});
