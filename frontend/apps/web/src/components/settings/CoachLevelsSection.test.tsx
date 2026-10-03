/**
 * settings.unsaved-edits rule 2 (PAD-394, ledger B-157): "unsaved" is whether the
 * ladder differs BY VALUE from the last loaded/saved rows — not "was a row ever
 * touched". A code edited then retyped back is clean again; a successful save is
 * the new clean baseline; a failed save stays unsaved. settings.explicit-save (PAD-506): the levels
 * are saved by the tab's one Save (the harness's `harness-save`), removed rows included.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const getCoachLevels = vi.fn();
const addCoachLevel = vi.fn();
const deleteCoachLevel = vi.fn();
vi.mock("@/api/coachLevel", () => ({
  getCoachLevels: (...a: unknown[]) => getCoachLevels(...a),
  addCoachLevel: (...a: unknown[]) => addCoachLevel(...a),
  deleteCoachLevel: (...a: unknown[]) => deleteCoachLevel(...a),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { CoachLevelsSection } from "./CoachLevelsSection";
import { SettingsUnsavedTestHarness } from "@/test/settingsUnsavedTestHarness";

const LEVEL = { id: "1", coachId: "c1", code: "I1", label: "Iniciante 1", displayOrder: 1 };

beforeEach(() => {
  getCoachLevels.mockReset().mockResolvedValue([LEVEL]);
  addCoachLevel.mockReset();
  deleteCoachLevel.mockReset();
});

const unsavedIds = () => screen.getByTestId("unsaved-ids").textContent;
const codeInput = () => screen.getAllByLabelText("settings.coachLevels.code")[0] as HTMLInputElement;

describe("CoachLevelsSection — reports unsaved by rule 2 (PAD-394)", () => {
  it("reports unsaved after an edit, and clean again once undone by hand", async () => {
    render(
      <SettingsUnsavedTestHarness>
        <CoachLevelsSection />
      </SettingsUnsavedTestHarness>
    );
    await screen.findByTestId("coach-level-row");
    expect(unsavedIds()).toBe("");

    fireEvent.change(codeInput(), { target: { value: "I2" } });
    expect(unsavedIds()).toBe("coachLevels");

    fireEvent.change(codeInput(), { target: { value: "I1" } });
    expect(unsavedIds()).toBe("");
  });

  it("is clean again after a successful save", async () => {
    addCoachLevel.mockResolvedValue(undefined);
    getCoachLevels.mockResolvedValueOnce([LEVEL]).mockResolvedValueOnce([{ ...LEVEL, code: "I2" }]);
    render(
      <SettingsUnsavedTestHarness>
        <CoachLevelsSection />
      </SettingsUnsavedTestHarness>
    );
    await screen.findByTestId("coach-level-row");
    fireEvent.change(codeInput(), { target: { value: "I2" } });
    expect(unsavedIds()).toBe("coachLevels");

    fireEvent.click(screen.getByTestId("harness-save")); // the tab's one Save (settings.explicit-save)
    await waitFor(() => expect(addCoachLevel).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(unsavedIds()).toBe(""));
  });

  it("stays unsaved after a failed save", async () => {
    addCoachLevel.mockRejectedValue(new Error("nope"));
    render(
      <SettingsUnsavedTestHarness>
        <CoachLevelsSection />
      </SettingsUnsavedTestHarness>
    );
    await screen.findByTestId("coach-level-row");
    fireEvent.change(codeInput(), { target: { value: "I2" } });
    expect(unsavedIds()).toBe("coachLevels");

    fireEvent.click(screen.getByTestId("harness-save")); // the tab's one Save (settings.explicit-save)
    await waitFor(() => expect(addCoachLevel).toHaveBeenCalledTimes(1));
    expect(unsavedIds()).toBe("coachLevels");
  });

  it("removing a stored row is held: nothing is deleted until the Save, which deletes it", async () => {
    addCoachLevel.mockResolvedValue(undefined);
    deleteCoachLevel.mockResolvedValue(undefined);
    getCoachLevels.mockResolvedValueOnce([LEVEL]).mockResolvedValueOnce([]);
    render(
      <SettingsUnsavedTestHarness>
        <CoachLevelsSection />
      </SettingsUnsavedTestHarness>
    );
    await screen.findByTestId("coach-level-row");

    fireEvent.click(screen.getByLabelText("settings.coachLevels.remove"));
    expect(screen.queryByTestId("coach-level-row")).toBeNull();
    expect(deleteCoachLevel).not.toHaveBeenCalled();
    expect(unsavedIds()).toBe("coachLevels");

    fireEvent.click(screen.getByTestId("harness-save"));
    await waitFor(() => expect(deleteCoachLevel).toHaveBeenCalledWith("1"));
    await waitFor(() => expect(unsavedIds()).toBe(""));
  });

  it("there is no section Save button any more", async () => {
    render(
      <SettingsUnsavedTestHarness>
        <CoachLevelsSection />
      </SettingsUnsavedTestHarness>
    );
    await screen.findByTestId("coach-level-row");
    expect(screen.queryByText("settings.coachLevels.saveLevels")).toBeNull();
  });
});
