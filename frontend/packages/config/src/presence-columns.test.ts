import { describe, expect, it } from "vitest";

import {
  DEFAULT_VISIBLE_COLUMNS,
  PINNED_COLUMN,
  PRESENCE_COLUMNS,
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
