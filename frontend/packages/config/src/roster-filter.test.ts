import { describe, expect, it } from "vitest";
import { rosterFilterFromParams, rosterFilterQuery } from "./roster-filter";

const params = (q: string) => {
  const s = new URLSearchParams(q);
  return (name: string) => s.get(name);
};

describe("rosterFilterFromParams (players.list rule 5)", () => {
  it("reads the one filter a URL asks for", () => {
    expect(rosterFilterFromParams(params("pending=true"))).toBe("pending");
    expect(rosterFilterFromParams(params("missing_side=true"))).toBe("missing_side");
    expect(rosterFilterFromParams(params(""))).toBeNull();
    expect(rosterFilterFromParams(params("incomplete=false"))).toBeNull();
  });

  it("keeps the first of pending, incomplete, missing_level, missing_side when a URL carries several", () => {
    expect(rosterFilterFromParams(params("missing_side=true&incomplete=true"))).toBe("incomplete");
    expect(rosterFilterFromParams(params("missing_level=true&pending=true"))).toBe("pending");
  });

  it("turns one filter into the paginated roster's params", () => {
    expect(rosterFilterQuery("incomplete")).toEqual({ pending: false, incomplete: true, missingLevel: false, missingSide: false });
    expect(rosterFilterQuery(null)).toEqual({ pending: false, incomplete: false, missingLevel: false, missingSide: false });
  });
});
