import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ClassEvaluations,
  EvaluationClassRef,
  EvaluationCompetencies,
  EvaluationEvolution,
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

/** "Evolução" of one competency (PAD-375). Every figure in it is the server's (R-048). */
export function usePlayerEvolution(playerId: string | null | undefined, categoryId: number | null, enabled = true) {
  return useQuery<EvaluationEvolution>({
    queryKey: queryKeys.playerEvolution(playerId ?? "none", categoryId ?? undefined),
    queryFn: () => evaluationRecordsApi.getEvaluationEvolution(playerId as string, categoryId as number),
    enabled: !!playerId && categoryId !== null && enabled,
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
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.playerEvaluations(playerId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.playerEvolution(playerId) }); // a rating moves the means
      void queryClient.invalidateQueries({ queryKey: queryKeys.classEvaluations() }); // and a class row's summary
    },
  });
}

export function useDeleteEvaluationRecord(playerId: string) {
  const queryClient = useQueryClient();
  return useMutation<void, unknown, number>({
    mutationFn: (recordId) => evaluationRecordsApi.deleteEvaluationRecord(recordId),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.playerEvaluations(playerId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.playerEvolution(playerId) }); // a rating moves the means
      void queryClient.invalidateQueries({ queryKey: queryKeys.classEvaluations() }); // and a class row's summary
    },
  });
}

/**
 * The class panel's read (evaluations.class-panel rule 3, PAD-376): who is in the dated
 * occurrence, absent last, each with their most recent record in it, and `canRate`.
 * It never materialises the occurrence, so the class detail may fire it on open.
 * A refusal (403: not the owner) is an answer, not a fault — no retry.
 */
export function useClassEvaluations(ref: EvaluationClassRef | null, enabled = true) {
  return useQuery<ClassEvaluations>({
    queryKey: queryKeys.classEvaluations(ref ?? { model: "none", id: 0 }),
    queryFn: () => evaluationRecordsApi.getClassEvaluations(ref as EvaluationClassRef),
    enabled: ref !== null && enabled,
    retry: false,
  });
}
