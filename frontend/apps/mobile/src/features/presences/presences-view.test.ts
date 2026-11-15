import { describe, expect, it } from "vitest";
import {
  DEFAULT_VISIBLE_COLUMNS,
  applyLoadedView,
  chooseColumns,
  chooseDefaultPeriod,
  initialPresencesView,
  presencesViewPayload,
  resolveDefaultPeriod,
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
    expect(presencesViewPayload({ columns: ["name", "total"], defaultPeriod: "thisMonth" })).toEqual({
      columns: ["name", "total"],
      defaultPeriod: "thisMonth",
    });
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

  // PAD-837c (Q5, criterion 72): the default period lives in the same view, "thisMonth" until
  // the coach makes another shortcut theirs; "Usar como predefinido" sends the whole view, so the
  // columns ride along and a late load never undoes the choice.
  it("[ATTENDANCE-VALIDATION-72] reads the coach's default period from the saved view, 'thisMonth' when unset", () => {
    expect(resolveDefaultPeriod(null)).toBe("thisMonth");
    expect(resolveDefaultPeriod({ columns: ["total"] })).toBe("thisMonth");
    expect(resolveDefaultPeriod({ columns: ["total"], defaultPeriod: "lastMonth" })).toBe("lastMonth");
    expect(resolveDefaultPeriod({ columns: ["total"], defaultPeriod: "fortnight" })).toBe("thisMonth");
    const loaded = applyLoadedView(initialPresencesView(), { columns: ["total"], defaultPeriod: "lastMonth" });
    expect(loaded.defaultPeriod).toBe("lastMonth");
    expect(loaded.columns).toEqual(["name", "total"]);
  });

  it("[ATTENDANCE-VALIDATION-72] 'make this my default' sends the whole view and survives a late load", () => {
    const chosen = chooseDefaultPeriod(initialPresencesView(), "lastMonth");
    expect(presencesViewPayload(chosen)).toEqual({ columns: DEFAULT_VISIBLE_COLUMNS, defaultPeriod: "lastMonth" });
    const afterLoad = applyLoadedView(chosen, { columns: ["total", "justified"], defaultPeriod: "thisWeek" });
    expect(afterLoad.defaultPeriod).toBe("lastMonth");
    expect(afterLoad.columns).toEqual(["name", "total", "justified"]);
  });
});
