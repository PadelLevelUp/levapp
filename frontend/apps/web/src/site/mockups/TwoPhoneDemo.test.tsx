/** PAD-656: the two-phone demo advances on a clock only once on screen, and never under reduced motion. */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: "pt" } }),
}));

import { STEP_MS, TwoPhoneDemo } from "./TwoPhoneDemo";

let observers: FakeIO[] = [];
class FakeIO {
  cb: IntersectionObserverCallback;
  constructor(cb: IntersectionObserverCallback) {
    this.cb = cb;
    observers.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
const intersect = () => act(() => observers.forEach((o) => o.cb([{ isIntersecting: true } as IntersectionObserverEntry], o as unknown as IntersectionObserver)));
// One act per STEP_MS so each re-render schedules the next timer, as real time would.
const tick = (ms: number) => {
  for (let left = ms; left > 0; left -= STEP_MS) act(() => void vi.advanceTimersByTime(Math.min(left, STEP_MS)));
};
const stubMotion = (reduce: boolean) =>
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));
const step = () => screen.getByTestId("site-demo-two-phones").getAttribute("data-step");

beforeEach(() => {
  vi.useFakeTimers();
  observers = [];
  vi.stubGlobal("IntersectionObserver", FakeIO);
  stubMotion(false);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TwoPhoneDemo (PAD-656)", () => {
  it("does not advance before the section intersects", () => {
    render(<TwoPhoneDemo />);
    tick(STEP_MS * 3);
    expect(step()).toBe("0");
  });

  it("advances 0 -> 1 after STEP_MS once on screen", () => {
    render(<TwoPhoneDemo />);
    intersect();
    tick(STEP_MS - 1);
    expect(step()).toBe("0");
    tick(1);
    expect(step()).toBe("1");
  });

  it("a click on a step jumps there and stops autoplay", () => {
    render(<TwoPhoneDemo />);
    intersect();
    fireEvent.click(screen.getByTestId("site-demo-step-3"));
    expect(step()).toBe("3");
    expect(screen.getByTestId("site-demo-step-3")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("site-demo-step-0")).toHaveAttribute("aria-pressed", "false");
    tick(STEP_MS);
    expect(step()).toBe("3");
  });

  it("under reduced motion nothing advances on a clock, but the user can still step and play", () => {
    stubMotion(true);
    render(<TwoPhoneDemo />);
    intersect();
    tick(STEP_MS * 3);
    expect(step()).toBe("0");
    fireEvent.click(screen.getByTestId("site-demo-step-2"));
    expect(step()).toBe("2");
    fireEvent.click(screen.getByTestId("site-demo-toggle"));
    expect(step()).toBe("3");
    tick(STEP_MS * 3);
    expect(step()).toBe("3");
  });

  it("stops after the last step and offers the replay", () => {
    render(<TwoPhoneDemo />);
    intersect();
    expect(screen.getByTestId("site-demo-toggle")).toHaveTextContent("site.coaches.demo.pause");
    tick(STEP_MS * 4);
    expect(step()).toBe("4");
    tick(STEP_MS * 3);
    expect(step()).toBe("4");
    expect(screen.getByTestId("site-demo-toggle")).toHaveTextContent("site.coaches.demo.replay");
    fireEvent.click(screen.getByTestId("site-demo-toggle"));
    expect(step()).toBe("0");
    tick(STEP_MS);
    expect(step()).toBe("1");
  });
});
