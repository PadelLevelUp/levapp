import { describe, expect, it } from "vitest";
import { presenceRowsOrder, searchPresencePlayers } from "./presenceSearch";

const row = (playerId: number, name: string) => ({ playerId, name });

describe("searchPresencePlayers (players.search, PAD-665)", () => {
  it("finds 'rui basto' → 'Rui Pedro Basto' and 'andre' → 'André'", () => {
    const rows = [row(1, "Rui Pedro Basto"), row(2, "André Nunes")];
    expect(searchPresencePlayers(rows, "rui basto")).toEqual([rows[0]]);
    expect(searchPresencePlayers(rows, "andre")).toEqual([rows[1]]);
  });

  it("lists the best match first and keeps a blank query in the given order", () => {
    const rows = [row(1, "Ana Rita"), row(2, "Rita Zé")];
    expect(searchPresencePlayers(rows, "rita").map((r) => r.playerId)).toEqual([2, 1]);
    expect(searchPresencePlayers(rows, "  ")).toEqual(rows);
  });

  it("never returns a row that was not passed in", () => {
    expect(searchPresencePlayers([row(1, "Ana")], "bruno")).toEqual([]);
  });
});

describe("presenceRowsOrder", () => {
  it("is relevance only for a typed name on the default sort", () => {
    expect(presenceRowsOrder("rita", "total", "desc")).toBe("relevance");
    expect(presenceRowsOrder("", "total", "desc")).toBe("sort");
    expect(presenceRowsOrder("rita", "name", "asc")).toBe("sort");
    expect(presenceRowsOrder("rita", "total", "asc")).toBe("sort");
  });
});
