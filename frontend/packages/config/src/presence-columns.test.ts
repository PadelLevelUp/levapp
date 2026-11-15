import { describe, expect, it } from "vitest";

import {
  DEFAULT_VISIBLE_COLUMNS,
  PINNED_COLUMN,
  PRESENCE_COLUMNS,
  resolvePresencesView,
  toggleColumn,
  visibleColumns,
} from "./presence-columns";

describe("the Presences column list (PAD-837, attendance.validation rule 17c)", () => {
  it("[ATTENDANCE-VALIDATION-64] lists every column once with its unit and default", () => {
    const keys = PRESENCE_COLUMNS.map((column) => column.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys[0]).toBe(PINNED_COLUMN);
    for (const column of PRESENCE_COLUMNS) {
      // Only the player column is text; every metric is a number with a unit.
      expect(column.numeric).toBe(column.unit !== "name");
    }
    // The defaults are the list's own flags, in the list's order, and include the pinned column.
    expect(DEFAULT_VISIBLE_COLUMNS).toEqual(
      PRESENCE_COLUMNS.filter((column) => column.defaultVisible).map((column) => column.key)
    );
    expect(DEFAULT_VISIBLE_COLUMNS).toContain(PINNED_COLUMN);
  });

  it("[ATTENDANCE-VALIDATION-64] keeps the list's order whatever the tap order", () => {
    let visible = ["name"] as typeof DEFAULT_VISIBLE_COLUMNS;
    for (const column of [...PRESENCE_COLUMNS].reverse()) {
      visible = toggleColumn(visible, column.key);
    }
    expect(visible).toEqual(PRESENCE_COLUMNS.map((column) => column.key));
    expect(visibleColumns(["invitesJoined", "name", "total"]).map((c) => c.key)).toEqual([
      "name",
      "total",
      "invitesJoined",
    ]);
  });

  it("[ATTENDANCE-VALIDATION-21] never hides the pinned player column", () => {
    expect(toggleColumn(DEFAULT_VISIBLE_COLUMNS, PINNED_COLUMN)).toEqual(DEFAULT_VISIBLE_COLUMNS);
  });
});

describe("resolvePresencesView (PAD-837, settings.coach-presences-view rule 3)", () => {
  it("[SETTINGS-COACH-PRESENCES-VIEW-3] resolves a stored view against the column list", () => {
    // Never saved, or a load that failed: the defaults.
    expect(resolvePresencesView(null)).toEqual(DEFAULT_VISIBLE_COLUMNS);
    // A retired id is ignored; the pinned column is shown though it was not stored.
    expect(resolvePresencesView({ columns: ["retiredColumn", "justified"] })).toEqual(["name", "justified"]);
    // The list's order, not the stored one.
    expect(resolvePresencesView({ columns: ["invitesJoined", "total"] })).toEqual([
      "name",
      "total",
      "invitesJoined",
    ]);
    // A stored empty list: the player column alone.
    expect(resolvePresencesView({ columns: [] })).toEqual(["name"]);
  });

  it("[SETTINGS-COACH-PRESENCES-VIEW-3] reads anything that is not a view as the defaults", () => {
    for (const stored of [undefined, "total", 3, {}, { columns: "total" }, { columns: null }]) {
      expect(resolvePresencesView(stored)).toEqual(DEFAULT_VISIBLE_COLUMNS);
    }
  });
});
