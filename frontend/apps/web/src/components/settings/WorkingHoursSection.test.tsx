/**
 * PAD-392 (B-155): a change of language never undoes an unsaved edit.
 *
 * The section loaded its week in an effect that listed `t` in its deps. `t` gets a new
 * identity whenever the language changes — on web that happens on EVERY page load, when
 * the account's language is applied over i18n's "pt" start — so the effect re-ran and
 * the second load replaced the week, silently undoing whatever the coach had changed in
 * between (seen in the release integrator's traces: the second GET resolved 6 ms and
 * 1 ms after the click it undid).
 *
 * No timing here: the test hands the component a NEW `t` at a moment of its choosing,
 * which is exactly the mechanism, and asserts the edit is still there and that the week
 * was loaded once.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const getCoachWorkingHours = vi.fn();
const putCoachWorkingHours = vi.fn();
vi.mock("@levelup/api", () => ({
  workingHoursApi: {
    getCoachWorkingHours: (...a: unknown[]) => getCoachWorkingHours(...a),
    putCoachWorkingHours: (...a: unknown[]) => putCoachWorkingHours(...a),
  },
}));

// `t` with an identity the test controls: `settleLanguage()` is the account's language
// being applied — every `useTranslation()` caller gets a new function on its next render.
let currentT = (key: string) => key;
const settleLanguage = () => {
  currentT = (key: string) => key;
};
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: currentT, i18n: { language: "en" } }),
}));

import { WorkingHoursSection } from "./WorkingHoursSection";

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  getCoachWorkingHours.mockReset().mockResolvedValue({ workingHours: null });
  putCoachWorkingHours.mockReset();
  settleLanguage();
});

const sunday = () => screen.getByTestId("working-hours-day-sun");

describe("WorkingHoursSection — a late load never undoes an edit (PAD-392)", () => {
  it("keeps a day switched off when the language settles afterwards", async () => {
    const view = render(<WorkingHoursSection />);
    fireEvent.click(await screen.findByTestId("working-hours-works-sun"));
    expect(sunday()).toHaveAttribute("data-state", "off");

    settleLanguage();
    view.rerender(<WorkingHoursSection />);
    // Let any reload the re-render started resolve and apply.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(getCoachWorkingHours.mock.calls.length).toBeGreaterThan(0));

    expect(sunday()).toHaveAttribute("data-state", "off");
  });

  it("loads the week once, however often the language changes", async () => {
    const view = render(<WorkingHoursSection />);
    await screen.findByTestId("working-hours-works-sun");
    for (let i = 0; i < 3; i++) {
      settleLanguage();
      view.rerender(<WorkingHoursSection />);
      await act(async () => {
        await Promise.resolve();
      });
    }
    expect(getCoachWorkingHours).toHaveBeenCalledTimes(1);
  });

  it("still shows what the server holds when nothing was touched", async () => {
    getCoachWorkingHours.mockResolvedValue({ workingHours: { mon: [["09:00", "13:00"]], tue: [], wed: [["08:00", "22:00"]], thu: [["08:00", "22:00"]], fri: [["08:00", "22:00"]], sat: [["08:00", "22:00"]], sun: [] } });
    render(<WorkingHoursSection />);
    await screen.findByTestId("working-hours-works-sun");
    expect(sunday()).toHaveAttribute("data-state", "off");
    expect(screen.getByTestId("working-hours")).toHaveAttribute("data-state", "set");
  });
});
