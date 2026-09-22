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

/**
 * The server's answer goes into the cached list BEFORE the re-list is asked for
 * (Session-B's review of #361): a second toggle's invalidation cancels the first
 * one's refetch, so a row that only waited for the refetch snapped back to its old
 * state until the second GET landed. Written into the cache, the row is right the
 * moment its own request answers; the re-list then confirms it.
 */
function useCompetencyCache() {
  const queryClient = useQueryClient();
  const relist = () => queryClient.invalidateQueries({ queryKey: queryKeys.evaluationCompetencies });
  const put = (competency: EvaluationCompetency) =>
    queryClient.setQueryData<EvaluationCompetencies>(queryKeys.evaluationCompetencies, (data) => {
      if (!data) return data;
      const exists = data.competencies.some((c) => c.id === competency.id);
      return {
        competencies: exists
          ? data.competencies.map((c) => (c.id === competency.id ? competency : c))
          : [...data.competencies, competency],
        catalogue: data.catalogue.filter((entry) => entry.key !== competency.key),
      };
    });
  const drop = (id: number) =>
    queryClient.setQueryData<EvaluationCompetencies>(queryKeys.evaluationCompetencies, (data) =>
      data ? { ...data, competencies: data.competencies.filter((c) => c.id !== id) } : data);
  // A rename or a delete makes the cached impact (name, counts) of that row stale.
  const forgetImpact = (id: number) =>
    queryClient.invalidateQueries({ queryKey: queryKeys.evaluationCompetencyImpact(id) });
  return { relist, put, drop, forgetImpact };
}

/** Rule 6: the first switch-on of a built-in entry creates its row (idempotent for a key). */
export function useSwitchOnCatalogueCompetency() {
  const cache = useCompetencyCache();
  return useMutation<EvaluationCompetency, unknown, string>({
    mutationFn: (catalogueKey) => evaluationRecordsApi.switchOnCatalogueCompetency(catalogueKey),
    onSuccess: cache.put,
    onSettled: cache.relist,
  });
}

/** Rule 6: 409 `duplicate_name`, 400 `name_invalid` — see `evaluationApiErrorCode`. */
export function useCreateCustomCompetency() {
  const cache = useCompetencyCache();
  return useMutation<EvaluationCompetency, unknown, string>({
    mutationFn: (name) => evaluationRecordsApi.createCustomCompetency(name),
    onSuccess: cache.put,
    onSettled: cache.relist,
  });
}

/** Rules 7-8: only the keys present in `patch` are applied; `false` and `0` mean what they say. */
export function useUpdateEvaluationCompetency() {
  const cache = useCompetencyCache();
  return useMutation<EvaluationCompetency, unknown, { id: number; patch: EvaluationCompetencyPatch }>({
    mutationFn: ({ id, patch }) => evaluationRecordsApi.updateEvaluationCompetency(id, patch),
    onSuccess: (competency) => {
      cache.put(competency);
      void cache.forgetImpact(competency.id);
    },
    onSettled: cache.relist,
  });
}

/** Rule 9: custom and legacy only; a catalogue competency answers 409 `catalogue_competency`. */
export function useDeleteEvaluationCompetency() {
  const cache = useCompetencyCache();
  return useMutation<void, unknown, number>({
    mutationFn: (id) => evaluationRecordsApi.deleteEvaluationCompetency(id),
    onSuccess: (_void, id) => {
      cache.drop(id);
      void cache.forgetImpact(id);
    },
    onSettled: cache.relist,
  });
}

/**
 * Rule 9 (PAD-274's safeguard): what the delete would remove, read before the typed
 * name. Never served from cache: the dialog must show today's counts (iOS's client
 * keeps queries fresh for 30 s, long enough to read a stale count after a rating).
 */
export function useEvaluationCompetencyImpact(competencyId: number | null, enabled = true) {
  return useQuery<EvaluationCategoryImpact>({
    queryKey: queryKeys.evaluationCompetencyImpact(competencyId ?? -1),
    queryFn: () => evaluationRecordsApi.getEvaluationCompetencyImpact(competencyId as number),
    enabled: competencyId !== null && enabled,
    staleTime: 0,
  });
}

/** The v2 API refuses with `{"error": "<code>"}`. `null` for anything else (network, 500 HTML). */
export function evaluationApiErrorCode(error: unknown): string | null {
  const data = (error as { response?: { data?: unknown } } | null)?.response?.data;
  const code = (data as { error?: unknown } | null)?.error;
  return typeof data === "object" && typeof code === "string" ? code : null;
}
