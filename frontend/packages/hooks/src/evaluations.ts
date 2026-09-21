import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  EvaluationCategoryImpact,
  EvaluationCompetencies,
  EvaluationCompetency,
  EvaluationCompetencyPatch,
  EvaluationRecordInput,
  PlayerEvaluations,
  PutEvaluationRecordResult,
} from "@levelup/types";
import * as evaluationRecordsApi from "@levelup/api/src/resources/evaluationRecords";
import { queryKeys } from "./queryKeys";

// PAD-374 (evaluations.history): the player's evaluations on the v2 API, shared by
// the web drawer and the iOS screen. Every figure in these payloads is the server's.

export function usePlayerEvaluations(playerId: string | null | undefined, enabled = true) {
  return useQuery<PlayerEvaluations>({
    queryKey: queryKeys.playerEvaluations(playerId ?? "none"),
    queryFn: () => evaluationRecordsApi.getPlayerEvaluations(playerId as string),
    enabled: !!playerId && enabled,
  });
}

export function useEvaluationCompetencies(enabled = true) {
  return useQuery<EvaluationCompetencies>({
    queryKey: queryKeys.evaluationCompetencies,
    queryFn: evaluationRecordsApi.getEvaluationCompetencies,
    enabled,
  });
}

/**
 * One input = one `PUT /evaluation_record`. The answer IS today's record (or
 * `{deleted: true}`), so the history is refreshed from the server rather than
 * patched by hand — `lastEvaluatedOn`, the card list and `editable` stay the server's.
 */
export function usePutEvaluationRecord(playerId: string) {
  const queryClient = useQueryClient();
  return useMutation<PutEvaluationRecordResult, unknown, Omit<EvaluationRecordInput, "playerId">>({
    mutationFn: (input) => evaluationRecordsApi.putEvaluationRecord({ playerId, ...input }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.playerEvaluations(playerId) }),
  });
}

export function useDeleteEvaluationRecord(playerId: string) {
  const queryClient = useQueryClient();
  return useMutation<void, unknown, number>({
    mutationFn: (recordId) => evaluationRecordsApi.deleteEvaluationRecord(recordId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.playerEvaluations(playerId) }),
  });
}

// ── PAD-373: "Gerir competências" (evaluations.competencies rules 6-9, 12) ────────
// Every change applies when made. Each mutation re-lists the coach's competencies
// from the server, so the manager and every evaluation form show the same set.

function useRelistCompetencies() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.evaluationCompetencies });
}

/** Rule 6: the first switch-on of a built-in entry creates its row (idempotent for a key). */
export function useSwitchOnCatalogueCompetency() {
  const relist = useRelistCompetencies();
  return useMutation<EvaluationCompetency, unknown, string>({
    mutationFn: (catalogueKey) => evaluationRecordsApi.switchOnCatalogueCompetency(catalogueKey),
    onSettled: relist,
  });
}

/** Rule 6: 409 `duplicate_name`, 400 `name_invalid` — see `evaluationApiErrorCode`. */
export function useCreateCustomCompetency() {
  const relist = useRelistCompetencies();
  return useMutation<EvaluationCompetency, unknown, string>({
    mutationFn: (name) => evaluationRecordsApi.createCustomCompetency(name),
    onSettled: relist,
  });
}

/** Rules 7-8: only the keys present in `patch` are applied; `false` and `0` mean what they say. */
export function useUpdateEvaluationCompetency() {
  const relist = useRelistCompetencies();
  return useMutation<EvaluationCompetency, unknown, { id: number; patch: EvaluationCompetencyPatch }>({
    mutationFn: ({ id, patch }) => evaluationRecordsApi.updateEvaluationCompetency(id, patch),
    onSettled: relist,
  });
}

/** Rule 9: custom and legacy only; a catalogue competency answers 409 `catalogue_competency`. */
export function useDeleteEvaluationCompetency() {
  const relist = useRelistCompetencies();
  return useMutation<void, unknown, number>({
    mutationFn: (id) => evaluationRecordsApi.deleteEvaluationCompetency(id),
    onSettled: relist,
  });
}

/** Rule 9 (PAD-274's safeguard): what the delete would remove, read before the typed name. */
export function useEvaluationCompetencyImpact(competencyId: number | null, enabled = true) {
  return useQuery<EvaluationCategoryImpact>({
    queryKey: queryKeys.evaluationCompetencyImpact(competencyId ?? -1),
    queryFn: () => evaluationRecordsApi.getEvaluationCompetencyImpact(competencyId as number),
    enabled: competencyId !== null && enabled,
  });
}

/** The v2 API refuses with `{"error": "<code>"}`. `null` for anything else (network, 500 HTML). */
export function evaluationApiErrorCode(error: unknown): string | null {
  const data = (error as { response?: { data?: unknown } } | null)?.response?.data;
  const code = (data as { error?: unknown } | null)?.error;
  return typeof data === "object" && typeof code === "string" ? code : null;
}
