/**
 * PAD-392 (B-155): the season form is loaded once; a change of language never replaces
 * what has been typed into it.
 *
 * Same defect as the working-hours section: the load effect listed `t` in its deps, `t`
 * gets a new identity whenever the language changes (on web, on every page load), the
 * effect re-ran and its `setDraft(draftFrom(data))` overwrote the form. This effect also
 * had no cancel flag, so every load applied. No timing here: the test hands the
 * component a new `t` when it chooses.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const getSeason = vi.fn();
vi.mock("@/api/seasons", () => ({
  getSeason: (...a: unknown[]) => getSeason(...a),
  saveSeason: vi.fn(),
  deleteSeason: vi.fn(),
}));

let currentT = (key: string) => key;
const settleLanguage = () => {
  currentT = (key: string) => key;
};
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: currentT, i18n: { language: "en" } }),
}));

import { SeasonsSection } from "./SeasonsSection";

const SEASON = { label: "2026/27", startDay: 1, startMonth: 9, endDay: 31, endMonth: 7 };

beforeEach(() => {
  getSeason.mockReset().mockResolvedValue(SEASON);
  settleLanguage();
});

const label = () => screen.getByTestId("season-label") as HTMLInputElement;

describe("SeasonsSection — a late load never replaces the form (PAD-392)", () => {
  it("keeps what was typed when the language settles afterwards", async () => {
    const view = render(<SeasonsSection />);
    await screen.findByTestId("season-label");
    expect(label().value).toBe("2026/27");

    fireEvent.change(label(), { target: { value: "Epoca nova" } });
    expect(label().value).toBe("Epoca nova");

    settleLanguage();
    view.rerender(<SeasonsSection />);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(label().value).toBe("Epoca nova");
  });

  it("loads the season once, however often the language changes", async () => {
    const view = render(<SeasonsSection />);
    await screen.findByTestId("season-label");
    for (let i = 0; i < 3; i++) {
      settleLanguage();
      view.rerender(<SeasonsSection />);
      await act(async () => {
        await Promise.resolve();
      });
    }
    expect(getSeason).toHaveBeenCalledTimes(1);
  });
});
