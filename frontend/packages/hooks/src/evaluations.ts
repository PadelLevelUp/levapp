import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  EvaluationCompetencies,
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
