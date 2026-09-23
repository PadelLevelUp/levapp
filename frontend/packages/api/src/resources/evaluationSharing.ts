import type { EvaluationCard, EvaluationRecord, EvaluationShareInput } from "@levelup/types";
import { getApi } from "../client";

// PAD-402 (evaluations.sharing, evaluations.student-view). A coach previews and
// shares a record's `Card`; a player reads every card ever shared with them.
// Bodies are sent exactly as `EvaluationShareInput` says — `categoryIds`,
// `evolution` and `includeNote` are all required (sharing rule 11).

/** `POST .../share_preview` (sharing rule 3): writes nothing, returns the `Card`. */
export async function shareEvaluationPreview(recordId: number, input: EvaluationShareInput): Promise<EvaluationCard> {
  const res = await getApi().post(`/app/evaluation_record/${recordId}/share_preview`, input);
  return res.data;
}

/** `POST .../share` (sharing rule 7): create-or-update; returns the `Record`, `share` now set. */
export async function shareEvaluation(recordId: number, input: EvaluationShareInput): Promise<EvaluationRecord> {
  const res = await getApi().post(`/app/evaluation_record/${recordId}/share`, input);
  return res.data;
}

/** `DELETE .../share` (sharing rule 9): silent — the card leaves the player's list at once. */
export async function unshareEvaluation(recordId: number): Promise<void> {
  await getApi().delete(`/app/evaluation_record/${recordId}/share`);
}

/** `GET /my_evaluations` (student-view rule 2): every card shared with the caller, newest `sharedAt` first. */
export async function getMyEvaluations(): Promise<{ cards: EvaluationCard[] }> {
  const res = await getApi().get("/app/my_evaluations");
  return res.data;
}
