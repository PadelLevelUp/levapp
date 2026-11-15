import { describe, expect, it } from "vitest";

import { formatBalanceHours, formatMinutesAsHours } from "./presence-hours";
import {
  DEFAULT_VISIBLE_COLUMNS,
  PINNED_COLUMN,
  PRESENCE_COLUMNS,
  presenceCellText,
  resolveDefaultPeriod,
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

  it("[ATTENDANCE-VALIDATION-64] puts each hours twin right after its count column, hidden by default", () => {
    const keys: string[] = PRESENCE_COLUMNS.map((column) => column.key);
    // rule 17d: the ids are the wire's, so a cell reads the stats row by its column id.
    for (const [count, minutes] of [
      ["total", "presenceMinutes"],
      ["justified", "justifiedMinutes"],
      ["invitesJoined", "guestPresenceMinutes"],
    ]) {
      expect(keys.indexOf(minutes), minutes).toBe(keys.indexOf(count) + 1);
    }
    expect(keys.indexOf("balanceMinutes")).toBe(keys.indexOf("guestPresenceMinutes") + 1);
    const minutesColumns = PRESENCE_COLUMNS.filter((column) => column.unit === "minutes");
    expect(minutesColumns.map((c) => c.key)).toEqual([
      "presenceMinutes",
      "justifiedMinutes",
      "guestPresenceMinutes",
      "balanceMinutes",
    ]);
    expect(minutesColumns.every((c) => !c.defaultVisible)).toBe(true);
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

  it("[SETTINGS-COACH-PRESENCES-VIEW-3] hands back a list the caller may change without touching the defaults", () => {
    const before = [...DEFAULT_VISIBLE_COLUMNS];
    const shown = resolvePresencesView(null);
    expect(shown).not.toBe(DEFAULT_VISIBLE_COLUMNS);
    shown.push("justified");
    expect(DEFAULT_VISIBLE_COLUMNS).toEqual(before);
  });
});

describe("resolveDefaultPeriod (PAD-837, settings.coach-presences-view rule 3)", () => {
  it("[SETTINGS-COACH-PRESENCES-VIEW-6] resolves the default period of a stored view", () => {
    expect(resolveDefaultPeriod(null)).toBe("thisMonth");
    expect(resolveDefaultPeriod({ columns: ["total"] })).toBe("thisMonth");
    expect(resolveDefaultPeriod({ columns: ["total"], defaultPeriod: "lastMonth" })).toBe("lastMonth");
    expect(resolveDefaultPeriod({ columns: ["total"], defaultPeriod: "nextYear" })).toBe("thisMonth");
    for (const stored of [undefined, "lastMonth", 3, {}, { defaultPeriod: 2 }]) {
      expect(resolveDefaultPeriod(stored)).toBe("thisMonth");
    }
  });
});

describe("presenceCellText (PAD-837, attendance.validation rules 17, 17d)", () => {
  it("[ATTENDANCE-VALIDATION-63] writes a cell as the one formatter does, on screen and in the CSV", () => {
    const row = { total: 3, presenceMinutes: 150, justifiedMinutes: 45, guestPresenceMinutes: 90, balanceMinutes: -45 };
    expect(presenceCellText(row, "total")).toBe("3");
    expect(presenceCellText(row, "presenceMinutes")).toBe(formatMinutesAsHours(150));
    expect(presenceCellText(row, "justifiedMinutes")).toBe(formatMinutesAsHours(45));
    expect(presenceCellText(row, "guestPresenceMinutes")).toBe(formatMinutesAsHours(90));
    expect(presenceCellText(row, "balanceMinutes")).toBe(formatBalanceHours(-45));
    // A server without the balance yet: read as 0.
    expect(presenceCellText({ total: 1 }, "balanceMinutes")).toBe(formatBalanceHours(0));
  });
});
