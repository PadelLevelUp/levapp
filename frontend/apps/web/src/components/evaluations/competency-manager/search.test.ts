import { describe, expect, it } from "vitest";
import { COMPETENCY_MANAGER_ROUTE } from "@levelup/config";

import { competencyManagerSearch, isCompetencyManagerOpen, withoutCompetencyManager } from "./search";

// evaluations.competencies rule 11 (PAD-373): the manager opens over whatever page the
// coach is on, so the URL that opens it must keep that page's own query state.

describe("competencyManagerSearch", () => {
  it("adds the flag to an empty search — and that is exactly the shared route constant", () => {
    expect(competencyManagerSearch("")).toBe("?competencies=open");
    expect(competencyManagerSearch("")).toBe(COMPETENCY_MANAGER_ROUTE.web);
  });

  it("keeps the page's own params (Settings' tab, a class panel's ids)", () => {
    expect(competencyManagerSearch("?tab=preferences")).toBe("?tab=preferences&competencies=open");
    expect(competencyManagerSearch("?class=12&date=2026-10-01")).toBe("?class=12&date=2026-10-01&competencies=open");
  });

  it("does not add the flag twice", () => {
    expect(competencyManagerSearch("?tab=preferences&competencies=open")).toBe("?tab=preferences&competencies=open");
  });
});

describe("withoutCompetencyManager", () => {
  it("removes only the flag", () => {
    expect(withoutCompetencyManager("?tab=preferences&competencies=open")).toBe("?tab=preferences");
    expect(withoutCompetencyManager("?competencies=open")).toBe("");
    expect(withoutCompetencyManager("?tab=preferences")).toBe("?tab=preferences");
  });
});

describe("isCompetencyManagerOpen", () => {
  it("is true for the flag's one value only", () => {
    expect(isCompetencyManagerOpen("?tab=preferences&competencies=open")).toBe(true);
    expect(isCompetencyManagerOpen("?competencies=closed")).toBe(false);
    expect(isCompetencyManagerOpen("?tab=preferences")).toBe(false);
  });
});
