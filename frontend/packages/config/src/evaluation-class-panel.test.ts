/**
 * evaluations.class-panel rules 1, 5, 6, 10 (PAD-376): what a participant's row lists,
 * what its summary says, and when the class detail offers "Avaliações" at all.
 */
import { describe, expect, it } from "vitest";
import type { ClassEvaluations, EvaluationCompetency, EvaluationRecord } from "@levelup/types";
import { classEvaluationsAction, classRowCompetencies, classRowSummary } from "./evaluation-class-panel";

const competency = (id: number, name: string, over: Partial<EvaluationCompetency> = {}): EvaluationCompetency => ({
  id, key: null, name, group: "general", scaleMin: 1, scaleMax: 5, isActive: true, sortOrder: null, scoreCount: 0, ...over,
});
const ACTIVE = [competency(1, "Técnica", { key: "technique" }), competency(2, "Tática", { key: "tactics" }), competency(3, "Consistência", { key: "consistency" })];

const rating = (categoryId: number, name: string, score: number, key: string | null = null, scaleMax = 5) =>
  ({ categoryId, name, key, score, scaleMin: 1, scaleMax });
const record = (over: Partial<EvaluationRecord>): EvaluationRecord => ({
  id: 1, evaluatedOn: "2026-09-21", classInstanceId: 88, className: "Aula 5", note: null, editable: true, ratings: [], share: null, ...over,
});

const BANDEJA = competency(12, "Bandeja", { key: "bandeja", group: "technique", isActive: false });
const POSICAO = competency(13, "Posição atacante", { key: "attackPosition", group: "tactics", isActive: false });
const FOREHAND = competency(30, "Forehand", { group: null, scaleMax: 10, isActive: false });
/** The coach's whole set, switched-off ones included (the competency manager's read). */
const KNOWN = [...ACTIVE, BANDEJA, POSICAO, FOREHAND];

describe("what a row lists (rule 5, Q26)", () => {
  it("is the active competencies when the record rates nothing else", () => {
    expect(classRowCompetencies(ACTIVE, null, KNOWN).map((c) => c.id)).toEqual([1, 2, 3]);
    expect(classRowCompetencies(ACTIVE, record({ ratings: [rating(1, "Técnica", 4, "technique")] }), KNOWN).map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it("adds a switched-off competency the record already rates — as the coach's set knows it, so stars stay stars and a legacy scale stays a number", () => {
    const joao = record({ ratings: [rating(12, "Bandeja", 4, "bandeja"), rating(13, "Posição atacante", 4), rating(30, "Forehand", 7, null, 10)] });
    const listed = classRowCompetencies(ACTIVE, joao, KNOWN);
    expect(listed.map((c) => c.id)).toEqual([1, 2, 3, 12, 13, 30]);
    expect(listed[3]).toBe(BANDEJA);
    expect(listed[5]).toBe(FOREHAND);
  });

  it("a rated competency the set does not know is still listed, from the rating, as a number — never dropped, never guessed into stars", () => {
    const listed = classRowCompetencies(ACTIVE, record({ ratings: [rating(99, "Antiga", 3)] }), KNOWN);
    expect(listed.map((c) => c.id)).toEqual([1, 2, 3, 99]);
    expect(listed[3]).toMatchObject({ id: 99, name: "Antiga", key: null, group: null, scaleMin: 1, scaleMax: 5, isActive: false });
  });
});

describe("the row summary never hides a rating (rule 5, AV-070)", () => {
  it("counts only this occurrence's record: Técnica 4 here reads 1 of 3", () => {
    expect(classRowSummary(ACTIVE, record({ ratings: [rating(1, "Técnica", 4, "technique")] }))).toEqual({ rated: 1, total: 3 });
  });

  it("reads 3 of 6 when all three ratings sit under switched-off competencies — not 'no evaluation'", () => {
    const joao = record({
      ratings: [rating(12, "Bandeja", 4, "bandeja"), rating(13, "Posição atacante", 4), rating(14, "Tomada de decisão", 3)],
      note: "Continua a trabalhar a tomada de decisão no ataque.",
    });
    expect(classRowSummary(ACTIVE, joao)).toEqual({ rated: 3, total: 6 });
  });

  it("a record holding only a note counts nothing, and no record counts nothing", () => {
    expect(classRowSummary(ACTIVE, record({ note: "Boa sessão" }))).toEqual({ rated: 0, total: 3 });
    expect(classRowSummary(ACTIVE, null)).toEqual({ rated: 0, total: 3 });
  });

  it("an earlier day's record still counts (Q28): yesterday's Técnica 4 reads 1 of 3", () => {
    const yesterday = record({ evaluatedOn: "2026-09-20", editable: false, ratings: [rating(1, "Técnica", 4, "technique")] });
    expect(classRowSummary(ACTIVE, yesterday)).toEqual({ rated: 1, total: 3 });
  });

  it("with every competency switched off and nothing rated there is nothing to list", () => {
    expect(classRowCompetencies([], null, KNOWN)).toEqual([]);
    expect(classRowSummary([], null)).toEqual({ rated: 0, total: 0 });
  });
});

describe("when the class detail offers 'Avaliações' (rules 1, 10)", () => {
  const read = (over: Partial<ClassEvaluations>): ClassEvaluations => ({ classInstanceId: null, canRate: true, competencies: [], participants: [], ...over });

  it("never for a student, and never for an event that is not a class", () => {
    expect(classEvaluationsAction({ isCoach: false, isClass: true, data: read({}), isError: false })).toBe("hidden");
    expect(classEvaluationsAction({ isCoach: true, isClass: false, data: read({}), isError: false })).toBe("hidden");
  });

  it("is hidden when the read was REFUSED — a 403, the coach does not own the class", () => {
    expect(classEvaluationsAction({ isCoach: true, isClass: true, data: undefined, isError: true, errorStatus: 403 })).toBe("hidden");
  });

  it("any other failure is an 'error' state with a retry, never 'not the owner' (review F2)", () => {
    expect(classEvaluationsAction({ isCoach: true, isClass: true, data: undefined, isError: true, errorStatus: 502 })).toBe("error");
    expect(classEvaluationsAction({ isCoach: true, isClass: true, data: undefined, isError: true, errorStatus: undefined })).toBe("error");
  });

  it("a refetch that fails while the last good read is still held keeps the panel available", () => {
    expect(classEvaluationsAction({ isCoach: true, isClass: true, data: read({ canRate: true }), isError: true, errorStatus: 502 })).toBe("available");
    // but a 403 on refetch means the class changed hands: hidden, whatever was held
    expect(classEvaluationsAction({ isCoach: true, isClass: true, data: read({ canRate: true }), isError: true, errorStatus: 403 })).toBe("hidden");
  });

  it("waits for the server rather than guessing from a date", () => {
    expect(classEvaluationsAction({ isCoach: true, isClass: true, data: undefined, isError: false })).toBe("loading");
  });

  it("is unavailable exactly when the server says the occurrence cannot be rated, available otherwise", () => {
    expect(classEvaluationsAction({ isCoach: true, isClass: true, data: read({ canRate: false }), isError: false })).toBe("unavailable");
    expect(classEvaluationsAction({ isCoach: true, isClass: true, data: read({ canRate: true }), isError: false })).toBe("available");
    expect(classEvaluationsAction({ isCoach: true, isClass: true, data: read({ classInstanceId: 88, canRate: true }), isError: false })).toBe("available");
  });
});
