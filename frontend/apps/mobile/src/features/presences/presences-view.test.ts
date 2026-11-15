import { describe, expect, it } from "vitest";
import {
  DEFAULT_VISIBLE_COLUMNS,
  applyLoadedView,
  chooseColumns,
  initialPresencesView,
  presencesViewPayload,
  saveFailed,
  saveSucceeded,
  toggleColumn,
} from "@levelup/config";

/**
 * PAD-837b (settings.coach-presences-view rules 4 to 6) on iOS: the Presences screen runs the
 * same pure state as web (`@levelup/config`), saving when the columns sheet is applied. The sheet
 * and the screen are Maestro's; the decisions are here.
 */
describe("the saved Presences columns on iOS", () => {
  it("[SETTINGS-COACH-PRESENCES-VIEW-4] shows the defaults until the view loads, then the saved columns", () => {
    const start = initialPresencesView();
    expect(start.columns).toEqual(DEFAULT_VISIBLE_COLUMNS);
    const loaded = applyLoadedView(start, { columns: ["total", "justified"] });
    expect(loaded.columns).toEqual(["name", "total", "justified"]);
  });

  it("[SETTINGS-COACH-PRESENCES-VIEW-4] keeps a choice made before the view loaded", () => {
    const chosen = chooseColumns(initialPresencesView(), toggleColumn(DEFAULT_VISIBLE_COLUMNS, "private"));
    const afterLoad = applyLoadedView(chosen, { columns: ["total", "private", "academy"] });
    expect(afterLoad.columns).toEqual(chosen.columns);
    expect(afterLoad.columns).not.toContain("private");
  });

  it("[SETTINGS-COACH-PRESENCES-VIEW-4] a null or unreadable view shows the defaults", () => {
    expect(applyLoadedView(initialPresencesView(), null).columns).toEqual(DEFAULT_VISIBLE_COLUMNS);
    expect(applyLoadedView(initialPresencesView(), "nope").columns).toEqual(DEFAULT_VISIBLE_COLUMNS);
  });

  it("[SETTINGS-COACH-PRESENCES-VIEW-4] sends the whole list on apply", () => {
    expect(presencesViewPayload(["name", "total"])).toEqual({ columns: ["name", "total"] });
  });

  it("[SETTINGS-COACH-PRESENCES-VIEW-5] says when the view was not saved, and keeps the columns", () => {
    const chosen = chooseColumns(initialPresencesView(), toggleColumn(DEFAULT_VISIBLE_COLUMNS, "justified"));
    const failed = saveFailed(chosen);
    expect(failed.unsaved).toBe(true);
    expect(failed.columns).toEqual(chosen.columns);
    expect(saveSucceeded(failed).unsaved).toBe(false);
    // The next choice starts clean.
    expect(chooseColumns(failed, chosen.columns).unsaved).toBe(false);
  });
});
