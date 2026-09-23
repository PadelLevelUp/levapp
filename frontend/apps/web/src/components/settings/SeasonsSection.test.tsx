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
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const getSeason = vi.fn();
const saveSeason = vi.fn();
const deleteSeason = vi.fn();
vi.mock("@/api/seasons", () => ({
  getSeason: (...a: unknown[]) => getSeason(...a),
  saveSeason: (...a: unknown[]) => saveSeason(...a),
  deleteSeason: (...a: unknown[]) => deleteSeason(...a),
}));

let currentT = (key: string) => key;
const settleLanguage = () => {
  currentT = (key: string) => key;
};
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: currentT, i18n: { language: "en" } }),
}));

import { SeasonsSection } from "./SeasonsSection";
import { SettingsUnsavedTestHarness } from "@/test/settingsUnsavedTestHarness";

const SEASON = { label: "2026/27", startDay: 1, startMonth: 9, endDay: 31, endMonth: 7 };

beforeEach(() => {
  getSeason.mockReset().mockResolvedValue(SEASON);
  saveSeason.mockReset();
  deleteSeason.mockReset();
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

/** settings.unsaved-edits rule 2 (PAD-394, ledger B-157). */
describe("SeasonsSection — reports unsaved by rule 2 (PAD-394)", () => {
  const unsavedIds = () => screen.getByTestId("unsaved-ids").textContent;

  it("reports unsaved after an edit, and clean again once undone by hand", async () => {
    render(
      <SettingsUnsavedTestHarness>
        <SeasonsSection />
      </SettingsUnsavedTestHarness>
    );
    await screen.findByTestId("season-label");
    expect(unsavedIds()).toBe("");

    fireEvent.change(label(), { target: { value: "Epoca nova" } });
    expect(unsavedIds()).toBe("seasons");

    fireEvent.change(label(), { target: { value: "2026/27" } });
    expect(unsavedIds()).toBe("");
  });

  it("is clean again after a successful save", async () => {
    saveSeason.mockResolvedValue({ ...SEASON, label: "Epoca nova" });
    render(
      <SettingsUnsavedTestHarness>
        <SeasonsSection />
      </SettingsUnsavedTestHarness>
    );
    await screen.findByTestId("season-label");
    fireEvent.change(label(), { target: { value: "Epoca nova" } });
    expect(unsavedIds()).toBe("seasons");

    fireEvent.click(screen.getByTestId("season-save"));
    await waitFor(() => expect(saveSeason).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(unsavedIds()).toBe(""));
  });

  it("stays unsaved after a failed save", async () => {
    saveSeason.mockRejectedValue(new Error("nope"));
    render(
      <SettingsUnsavedTestHarness>
        <SeasonsSection />
      </SettingsUnsavedTestHarness>
    );
    await screen.findByTestId("season-label");
    fireEvent.change(label(), { target: { value: "Epoca nova" } });
    expect(unsavedIds()).toBe("seasons");

    fireEvent.click(screen.getByTestId("season-save"));
    await waitFor(() => expect(saveSeason).toHaveBeenCalledTimes(1));
    expect(unsavedIds()).toBe("seasons");
  });
});
