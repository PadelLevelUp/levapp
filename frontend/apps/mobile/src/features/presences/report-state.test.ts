import type {
  PresencePlayerStats,
  PresenceStatsTotals,
} from "@levelup/types";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SORT,
  DEFAULT_VISIBLE_COLUMNS,
  EMPTY_FILTERS,
  PRESENCE_COLUMNS,
  abbreviateName,
  activeFilterCount,
  buildPresencesCsv,
  csvFileName,
  filterPlayers,
  nextSort,
  sortPlayerStats,
  splitPoints,
  toggleColumn,
  topPlayerPoints,
  visibleColumns,
  type PresenceColumnKey,
} from "./report-state";

/**
 * PAD-166 — the filtering, sorting, CSV and chart-series arithmetic behind the
 * iOS Presences reporting surface.
 *
 * These are web's rules re-expressed on mobile, so the assertions are written
 * against the *behaviour web has* rather than against this implementation:
 * a blank filter field filters nothing, `0` is a real ceiling, the CSV is what
 * the screen is showing, and the pinned column cannot be turned off.
 */

function player(
  name: string,
  over: Partial<PresencePlayerStats> = {}
): PresencePlayerStats {
  return {
    playerId: Math.abs(hash(name)),
    name,
    total: 0,
    private: 0,
    academy: 0,
    justified: 0,
    unjustified: 0,
    invitesReceived: 0,
    invitesJoined: 0,
    ...over,
  };
}

function hash(value: string): number {
  return [...value].reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 7) | 0;
}

const ANA = player("Ana Ribeiro", {
  total: 12,
  private: 4,
  academy: 8,
  unjustified: 0,
  justified: 1,
  invitesReceived: 2,
  invitesJoined: 1,
});
const BRUNO = player("Bruno Silva", {
  total: 5,
  private: 5,
  academy: 0,
  unjustified: 3,
});
const CARLA = player("Carla Nunes", { total: 0, unjustified: 0 });
const ROSTER = [ANA, BRUNO, CARLA];

describe("filterPlayers", () => {
  it("returns everyone when no filter is set", () => {
    expect(filterPlayers(ROSTER, EMPTY_FILTERS)).toEqual(ROSTER);
  });

  it("keeps the zero-activity player, who is the point of a zero row", () => {
    // attendance.validation rule 12: the roster statistics cover every roster
    // player, and a coach reads the empty ones on purpose.
    expect(filterPlayers(ROSTER, EMPTY_FILTERS)).toContain(CARLA);
  });

  it("matches the search needle case-insensitively on any part of the name", () => {
    expect(
      filterPlayers(ROSTER, { ...EMPTY_FILTERS, query: "  siLVa " })
    ).toEqual([BRUNO]);
  });

  it("treats minTotal as an inclusive floor", () => {
    expect(
      filterPlayers(ROSTER, { ...EMPTY_FILTERS, minTotal: "5" }).map(
        (p) => p.name
      )
    ).toEqual(["Ana Ribeiro", "Bruno Silva"]);
  });

  it("treats maxUnjustified as an inclusive ceiling, and 0 as a real one", () => {
    // The bug this pins: coercing "" and "0" to the same number would make a
    // cleared field mean "nobody with any unjustified absence".
    expect(
      filterPlayers(ROSTER, { ...EMPTY_FILTERS, maxUnjustified: "0" }).map(
        (p) => p.name
      )
    ).toEqual(["Ana Ribeiro", "Carla Nunes"]);
    expect(
      filterPlayers(ROSTER, { ...EMPTY_FILTERS, maxUnjustified: "" })
    ).toHaveLength(3);
  });

  it("ignores a half-typed bound rather than blanking the list", () => {
    for (const partial of ["-", ".", "e"]) {
      expect(
        filterPlayers(ROSTER, { ...EMPTY_FILTERS, minTotal: partial })
      ).toHaveLength(3);
    }
  });

  it("combines every filter", () => {
    expect(
      filterPlayers(ROSTER, {
        query: "a",
        minTotal: "1",
        maxUnjustified: "0",
      }).map((p) => p.name)
    ).toEqual(["Ana Ribeiro"]);
  });
});

describe("activeFilterCount", () => {
  it("counts only the numeric filters, not the visible search box", () => {
    expect(activeFilterCount({ ...EMPTY_FILTERS, query: "ana" })).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTERS, minTotal: "3" })).toBe(1);
    expect(
      activeFilterCount({ query: "x", minTotal: "3", maxUnjustified: "0" })
    ).toBe(2);
  });
});

describe("sortPlayerStats", () => {
  it("defaults to biggest totals first, as web's table does", () => {
    expect(sortPlayerStats(ROSTER, DEFAULT_SORT).map((p) => p.name)).toEqual([
      "Ana Ribeiro",
      "Bruno Silva",
      "Carla Nunes",
    ]);
  });

  it("sorts names with locale collation, not code points", () => {
    const sorted = sortPlayerStats(
      [player("Ávila"), player("Zeca"), player("Bento")],
      { key: "name", direction: "asc" }
    ).map((p) => p.name);
    // "Ávila" (U+00C1) sorts after "Zeca" by code point and before "Bento" by
    // collation — the whole reason localeCompare is used.
    expect(sorted).toEqual(["Ávila", "Bento", "Zeca"]);
  });

  it("does not mutate its input", () => {
    const input = [BRUNO, ANA];
    sortPlayerStats(input, DEFAULT_SORT);
    expect(input.map((p) => p.name)).toEqual(["Bruno Silva", "Ana Ribeiro"]);
  });
});

describe("nextSort", () => {
  it("flips direction when the same column is tapped again", () => {
    expect(nextSort({ key: "total", direction: "desc" }, "total")).toEqual({
      key: "total",
      direction: "asc",
    });
  });

  it("starts counts biggest-first and names A–Z", () => {
    expect(nextSort(DEFAULT_SORT, "unjustified")).toEqual({
      key: "unjustified",
      direction: "desc",
    });
    expect(nextSort(DEFAULT_SORT, "name")).toEqual({
      key: "name",
      direction: "asc",
    });
  });
});

describe("toggleColumn", () => {
  it("adds a hidden column back in display order, not tap order", () => {
    const next = toggleColumn(["name", "unjustified"], "total");
    expect(next).toEqual(["name", "total", "unjustified"]);
  });

  it("removes a shown column", () => {
    expect(toggleColumn(DEFAULT_VISIBLE_COLUMNS, "academy")).toEqual([
      "name",
      "total",
      "private",
      "unjustified",
    ]);
  });

  it("refuses to hide the pinned player column", () => {
    // Without the name every row is anonymous numbers, and so is the CSV.
    expect(toggleColumn(DEFAULT_VISIBLE_COLUMNS, "name")).toEqual(
      DEFAULT_VISIBLE_COLUMNS
    );
  });

  it("covers every column in PRESENCE_COLUMNS", () => {
    // A column added to the constant without a label or a toggle path would
    // otherwise ship as a blank header in the CSV.
    let visible: PresenceColumnKey[] = ["name"];
    for (const column of PRESENCE_COLUMNS) {
      visible = toggleColumn(visible, column.key);
    }
    expect(visible).toEqual(PRESENCE_COLUMNS.map((c) => c.key));
  });
});

describe("buildPresencesCsv", () => {
  const label = (key: PresenceColumnKey) => `L:${key}`;

  it("exports the visible columns, in display order, for the given rows", () => {
    const csv = buildPresencesCsv(
      [ANA, BRUNO],
      visibleColumns(["name", "total", "unjustified"]),
      label
    );
    expect(csv.split("\n")).toEqual([
      '"L:name","L:total","L:unjustified"',
      '"Ana Ribeiro","12","0"',
      '"Bruno Silva","5","3"',
    ]);
  });

  it("quotes every field and doubles embedded quotes", () => {
    const csv = buildPresencesCsv(
      [player('Rui "Rex", Jr', { total: 1 })],
      visibleColumns(["name", "total"]),
      label
    );
    expect(csv.split("\n")[1]).toBe('"Rui ""Rex"", Jr","1"');
  });

  it("writes a header even when nothing survived the filters", () => {
    // An empty export is still a valid CSV a spreadsheet can open — a
    // zero-byte file reads as a failed export.
    expect(buildPresencesCsv([], visibleColumns(["name"]), label)).toBe(
      '"L:name"'
    );
  });

  it("orders rows exactly as they were handed in", () => {
    const csv = buildPresencesCsv(
      sortPlayerStats(ROSTER, { key: "name", direction: "desc" }),
      visibleColumns(["name"]),
      label
    );
    expect(csv.split("\n").slice(1)).toEqual([
      '"Carla Nunes"',
      '"Bruno Silva"',
      '"Ana Ribeiro"',
    ]);
  });
});

describe("csvFileName", () => {
  it("date-stamps the file so monthly exports do not collide", () => {
    expect(csvFileName(new Date("2026-09-06T22:30:00Z"))).toBe(
      "presences-2026-09-06.csv"
    );
  });
});

describe("abbreviateName", () => {
  it("shortens the surname so eight labels fit a phone axis", () => {
    expect(abbreviateName("Miguel Ferreira")).toBe("Miguel F.");
  });

  it("leaves a single name alone", () => {
    expect(abbreviateName("Madonna")).toBe("Madonna");
  });

  it("uses the second word, not the last, and survives extra spaces", () => {
    expect(abbreviateName("  Ana   Ribeiro Costa ")).toBe("Ana R.");
  });
});

describe("topPlayerPoints", () => {
  it("ranks by total, biggest first, and abbreviates the labels", () => {
    expect(topPlayerPoints(ROSTER)).toEqual([
      { label: "Ana R.", fullLabel: "Ana Ribeiro", value: 12 },
      { label: "Bruno S.", fullLabel: "Bruno Silva", value: 5 },
    ]);
  });

  it("drops players with no presences rather than drawing empty bars", () => {
    expect(topPlayerPoints(ROSTER).map((p) => p.fullLabel)).not.toContain(
      "Carla Nunes"
    );
  });

  it("caps the series", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      player(`P${i}`, { total: i + 1 })
    );
    expect(topPlayerPoints(many)).toHaveLength(8);
    expect(topPlayerPoints(many, 3).map((p) => p.value)).toEqual([20, 19, 18]);
  });

  it("does not mutate its input", () => {
    const input = [BRUNO, ANA];
    topPlayerPoints(input);
    expect(input[0]).toBe(BRUNO);
  });
});

describe("splitPoints", () => {
  const labels = { private: "Privada", academy: "Academia" };

  it("reads the two totals the server already computed", () => {
    const totals = { private: 30, academy: 70 } as PresenceStatsTotals;
    expect(splitPoints(totals, labels)).toEqual([
      { label: "Privada", fullLabel: "Privada", value: 30 },
      { label: "Academia", fullLabel: "Academia", value: 70 },
    ]);
  });

  it("renders both slices as zero while the stats are absent", () => {
    // Not an empty array: the chart card would then claim "no attendance
    // recorded yet" during a load, which is a different statement.
    expect(splitPoints(undefined, labels).map((p) => p.value)).toEqual([0, 0]);
  });
});
