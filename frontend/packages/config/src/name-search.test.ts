import { describe, expect, it } from "vitest";
import { nameMatchesQuery, searchWords } from "./name-search";

describe("nameMatchesQuery (PAD-516, players.list rule 3)", () => {
  it("finds a name whose words are typed out of order or with words between", () => {
    expect(nameMatchesQuery("Pedro Mesquita e Sousa", "pedro sousa")).toBe(true);
    expect(nameMatchesQuery("Pedro Mesquita e Sousa", "sousa pedro")).toBe(true);
    expect(nameMatchesQuery("Pedro Mesquita e Sousa", "mesq sou")).toBe(true);
  });

  it("needs every word", () => {
    expect(nameMatchesQuery("Pedro Alves", "pedro sousa")).toBe(false);
  });

  it("folds accents, case and punctuation, and ignores extra spaces", () => {
    expect(nameMatchesQuery("João Álvares", "  joao   ALVARES ")).toBe(true);
    expect(nameMatchesQuery("Ana-Rita O'Neil", "oneil anarita")).toBe(true);
  });

  it("matches nobody on a query with no searchable characters", () => {
    expect(nameMatchesQuery("Anyone", "%")).toBe(false);
    expect(nameMatchesQuery("Anyone", " _ ")).toBe(false);
  });

  it("matches everyone on an empty query and nobody on a missing name", () => {
    expect(nameMatchesQuery("Anyone", "   ")).toBe(true);
    expect(nameMatchesQuery(null, "a")).toBe(false);
    expect(searchWords("")).toEqual([]);
  });
});

// players.search (PAD-665): the shared cases file — the Python twin runs the same file
// (backend/padel_app/tests/test_name_search_cases.py).
import cases from "./name-search.cases.json";
import { foldSearchText, rankPlayerMatch, searchPlayers } from "./name-search";

describe("players.search shared cases (PAD-665, B-531)", () => {
  it.each(cases.fold as [string, string][])("folds %j to %j", (input, out) => {
    expect(foldSearchText(input)).toBe(out);
  });

  it.each(cases.rank as { name: string | null; nickname?: string | null; email?: string; phone?: string; query: string; tier: number | null }[])(
    "$name / $query → tier $tier",
    ({ query, tier, ...fields }) => {
      expect(rankPlayerMatch(fields, query)).toBe(tier);
    }
  );
});

describe("searchPlayers (PAD-665, players.search rule 6)", () => {
  const roster = [
    { id: 3, name: "Mariana Costa" },
    { id: 1, name: "Joana Anacleto" },
    { id: 2, name: "Ana Rita" },
    { id: 4, name: "Bruno Dias" },
  ];
  it("ranks by tier, then name; drops non-matches", () => {
    expect(searchPlayers(roster, "ana", (p) => p).map((p) => p.name)).toEqual([
      "Ana Rita",
      "Joana Anacleto",
      "Mariana Costa",
    ]);
  });
  it("keeps the screen's order on a blank query", () => {
    expect(searchPlayers(roster, "  ", (p) => p)).toEqual(roster);
  });
});
