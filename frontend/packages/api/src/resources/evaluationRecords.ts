import type {
  ClassEvaluations,
  EvaluationClassRef,
  EvaluationCompetencies,
  EvaluationCompetency,
  EvaluationCompetencyPatch,
  EvaluationCategoryImpact,
  EvaluationEvolution,
  EvaluationRecordInput,
  PlayerEvaluations,
  PutEvaluationRecordResult,
} from "@levelup/types";
import { getApi } from "../client";

// The v2 evaluation API (PAD-364). `./evaluation` is the legacy module the old
// screens and App Store 1.0/1.1.0 use; it is frozen to legacy categories (R-047).
// Bodies are sent exactly as given: `false`, `0`, `""` and `null` mean what they
// say to the server, and an absent key means "leave it alone" — never strip them.

export async function getEvaluationCompetencies(): Promise<EvaluationCompetencies> {
  const res = await getApi().get("/app/evaluation_competencies");
  return res.data;
}

/** Switch a built-in competency on. Idempotent: an existing one comes back active. */
export async function switchOnCatalogueCompetency(catalogueKey: string): Promise<EvaluationCompetency> {
  const res = await getApi().post("/app/evaluation_competency", { catalogueKey });
  return res.data;
}

/** 409 when the coach already holds the name. With `parentId`, a sub-category of that category
 *  (PAD-431, evaluations.competencies rule 15). */
export async function createCustomCompetency(name: string, parentId?: number): Promise<EvaluationCompetency> {
  const res = await getApi().post("/app/evaluation_competency", parentId === undefined ? { name } : { name, parentId });
  return res.data;
}

export async function updateEvaluationCompetency(
  id: number,
  patch: EvaluationCompetencyPatch
): Promise<EvaluationCompetency> {
  const res = await getApi().patch(`/app/evaluation_competency/${id}`, patch);
  return res.data;
}

export async function getEvaluationCompetencyImpact(id: number): Promise<EvaluationCategoryImpact> {
  const res = await getApi().get(`/app/evaluation_competency/${id}/impact`);
  return res.data;
}

/** Custom and legacy competencies only; a built-in one answers 409 — switch it off instead. */
export async function deleteEvaluationCompetency(id: number): Promise<void> {
  await getApi().delete(`/app/evaluation_competency/${id}`);
}

export async function getPlayerEvaluations(playerId: number | string): Promise<PlayerEvaluations> {
  const res = await getApi().get(`/app/player/${playerId}/evaluations`);
  return res.data;
}

export async function putEvaluationRecord(
  input: EvaluationRecordInput,
  options?: { keepalive?: boolean }
): Promise<PutEvaluationRecordResult> {
  // `keepalive`: a flush from a page that is going away. XHR (axios's default browser adapter) is
  // aborted at unload; the fetch adapter with `keepalive` lets this one small PUT outlive the page,
  // Authorization header and all (sendBeacon could not carry the JWT).
  const config = options?.keepalive ? { adapter: "fetch" as const, fetchOptions: { keepalive: true } } : undefined;
  const res = await getApi().put("/app/evaluation_record", input, config);
  return res.data;
}

export async function deleteEvaluationRecord(id: number): Promise<void> {
  await getApi().delete(`/app/evaluation_record/${id}`);
}

export async function getEvaluationEvolution(
  playerId: number | string,
  categoryId: number
): Promise<EvaluationEvolution> {
  const res = await getApi().get(`/app/player/${playerId}/evaluations/evolution`, { params: { categoryId } });
  return res.data;
}

/** A read, POSTed like `/app/class_instance`. It never materialises the occurrence. */
export async function getClassEvaluations(ref: EvaluationClassRef): Promise<ClassEvaluations> {
  const res = await getApi().post("/app/class_instance/evaluations", undefined, {
    params: { model: ref.model, id: ref.id, date: ref.date ?? undefined },
  });
  return res.data;
}

export function isDeletedRecord(result: PutEvaluationRecordResult): result is { deleted: true } {
  return "deleted" in result;
}
