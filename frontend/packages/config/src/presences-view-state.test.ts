import { describe, expect, it } from "vitest";

import {
  applyLoadedView,
  chooseColumns,
  chooseDefaultPeriod,
  initialPresencesView,
  presencesViewPayload,
  saveFailed,
} from "./presences-view-state";

describe("the saved Presences view (PAD-837, settings.coach-presences-view rules 4 and 5)", () => {
  it("[SETTINGS-COACH-PRESENCES-VIEW-6] a save keeps the other field", () => {
    const loaded = applyLoadedView(initialPresencesView(), {
      columns: ["total", "justified"],
      defaultPeriod: "lastMonth",
    });
    expect(loaded.defaultPeriod).toBe("lastMonth");

    // Saving the columns sends the stored default with them.
    const columnsSaved = chooseColumns(loaded, ["name", "total"]);
    expect(presencesViewPayload(columnsSaved)).toEqual({ columns: ["name", "total"], defaultPeriod: "lastMonth" });

    // Making a default sends the stored columns with it.
    const defaultSaved = chooseDefaultPeriod(loaded, "thisWeek");
    expect(presencesViewPayload(defaultSaved)).toEqual({
      columns: ["name", "total", "justified"],
      defaultPeriod: "thisWeek",
    });
  });

  it("[SETTINGS-COACH-PRESENCES-VIEW-6] a late load keeps each choice and still brings the other field", () => {
    // A column chosen before the load: the saved default still arrives, so the next save keeps it.
    const early = chooseColumns(initialPresencesView(), ["name", "private"]);
    const late = applyLoadedView(early, { columns: ["total"], defaultPeriod: "lastMonth" });
    expect(late.columns).toEqual(["name", "private"]);
    expect(late.defaultPeriod).toBe("lastMonth");

    // A default chosen before the load stays; the saved columns arrive.
    const madeDefault = chooseDefaultPeriod(initialPresencesView(), "thisWeek");
    const after = applyLoadedView(madeDefault, { columns: ["total"], defaultPeriod: "lastMonth" });
    expect(after.defaultPeriod).toBe("thisWeek");
    expect(after.columns).toEqual(["name", "total"]);
  });

  it("[SETTINGS-COACH-PRESENCES-VIEW-5] a failed default save is said and kept", () => {
    const failed = saveFailed(chooseDefaultPeriod(initialPresencesView(), "lastMonth"));
    expect(failed.unsaved).toBe(true);
    expect(failed.defaultPeriod).toBe("lastMonth");
    expect(chooseDefaultPeriod(failed, "thisWeek").unsaved).toBe(false);
  });
});
