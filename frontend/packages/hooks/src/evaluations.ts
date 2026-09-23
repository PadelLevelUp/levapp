import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ClassEvaluations,
  EvaluationCard,
  EvaluationCategoryImpact,
  EvaluationClassRef,
  EvaluationCompetencies,
  EvaluationCompetency,
  EvaluationCompetencyPatch,
  EvaluationEvolution,
  EvaluationRecord,
  EvaluationRecordInput,
  EvaluationSettings,
  EvaluationShareInput,
  PlayerEvaluations,
  PutEvaluationRecordResult,
} from "@levelup/types";
import * as evaluationRecordsApi from "@levelup/api/src/resources/evaluationRecords";
import * as evaluationSettingsApi from "@levelup/api/src/resources/evaluationSettings";
import * as evaluationSharingApi from "@levelup/api/src/resources/evaluationSharing";
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
  return useMutation<PutEvaluationRecordResult, unknown, Omit<EvaluationRecordInput, "playerId"> & { keepalive?: boolean }>({
    // `keepalive` rides on the variables (one mutation call = one request) and never reaches the body.
    mutationFn: ({ keepalive, ...input }) => evaluationRecordsApi.putEvaluationRecord({ playerId, ...input }, { keepalive }),
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

// ── PAD-402: sharing an evaluation with the player (evaluations.sharing, evaluations.student-view) ──

/** Step 2 (sharing rule 3): writes nothing, returns the `Card` the coach previews. */
export function useShareEvaluationPreview() {
  return useMutation<EvaluationCard, unknown, { recordId: number; input: EvaluationShareInput }>({
    mutationFn: ({ recordId, input }) => evaluationSharingApi.shareEvaluationPreview(recordId, input),
  });
}

/**
 * Sharing rule 7: create-or-update; the answer is the `Record` with `share` set.
 * `playerId` names whose history to refresh — the coach's own read of this record —
 * alongside the player's own `my_evaluations` cache (student-view rule 2).
 */
export function useShareEvaluation(playerId: string) {
  const queryClient = useQueryClient();
  return useMutation<EvaluationRecord, unknown, { recordId: number; input: EvaluationShareInput }>({
    mutationFn: ({ recordId, input }) => evaluationSharingApi.shareEvaluation(recordId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.playerEvaluations(playerId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myEvaluations });
    },
  });
}

/** Sharing rule 9: silent — no message, no push; the card leaves the player's list at once. */
export function useUnshareEvaluation(playerId: string) {
  const queryClient = useQueryClient();
  return useMutation<void, unknown, number>({
    mutationFn: (recordId) => evaluationSharingApi.unshareEvaluation(recordId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.playerEvaluations(playerId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.myEvaluations });
    },
  });
}

/** Student-view rule 2: every card ever shared with the caller, newest `sharedAt` first. */
export function useMyEvaluations(enabled = true) {
  return useQuery<{ cards: EvaluationCard[] }>({
    queryKey: queryKeys.myEvaluations,
    queryFn: evaluationSharingApi.getMyEvaluations,
    enabled,
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

// ── PAD-404 (evaluations.reminders): the frequency and the `due` markers it drives ──

export function useEvaluationSettings(enabled = true) {
  return useQuery<EvaluationSettings>({
    queryKey: queryKeys.evaluationSettings,
    queryFn: () => evaluationSettingsApi.getEvaluationSettings(),
    enabled,
  });
}

/**
 * Saves on change. `due` is the server's (R-048), so every surface that shows the marker
 * is refetched rather than patched: both players lists (web's paginated, iOS's full list
 * and the pickers' `coach-players-all`) and every class panel.
 */
export function useSaveEvaluationSettings() {
  const queryClient = useQueryClient();
  return useMutation<EvaluationSettings, unknown, EvaluationSettings>({
    mutationFn: (body) => evaluationSettingsApi.putEvaluationSettings(body),
    onSuccess: (saved) => queryClient.setQueryData(queryKeys.evaluationSettings, saved),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.evaluationSettings });
      for (const prefix of ["coach-players-paginated", "coach-players", "coach-players-all"]) {
        void queryClient.invalidateQueries({ queryKey: [prefix] });
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.classEvaluations() });
    },
  });
}
