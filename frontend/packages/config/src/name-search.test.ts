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
