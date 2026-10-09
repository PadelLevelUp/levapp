/**
 * players.claim rule 5j (PAD-528): turn the merge preview's per-table counts into the
 * buckets the apps phrase — "2 attendances, 1 evaluation and 1 class move to your account;
 * 1 attendance you already had is kept". One helper for web and iOS, so the two shells
 * read the same plan the same way. Table names never reach the screen.
 */

export interface MergePlan {
  moves: Record<string, number>;
  dropped: Record<string, number>;
  merged: Record<string, number>;
}

/** The buckets, in the order they are spoken. */
export const MERGE_BUCKETS = ["attendances", "evaluations", "notes", "classes", "waitingList", "messages", "other"] as const;
export type MergeBucket = (typeof MERGE_BUCKETS)[number];

const TABLE_BUCKET: Record<string, MergeBucket | null> = {
  presences: "attendances",
  evaluation_records: "evaluations",
  evaluation_entries: null,          // the ratings of a record — counted by their record
  coach_player_notes: "notes",
  player_in_lesson: "classes",
  class_join_requests: "classes",
  class_requests: "classes",
  class_requests_invitees: null,     // bookkeeping on someone else's request
  waiting_list_entries: "waitingList",
  standing_waiting_list_entries: "waitingList",
  conversations: "messages",
  messages: null,                    // counted by their thread
  message_reactions: null,
  message_reports: null,
  coach_in_player: null,             // the relation itself; the kept one is the student's
  player_in_club: null,
  player_level_history: null,
  notification_events: null,
  reminder_attempts: null,
  vacancies: null,
  replacement_approval_prompts: null,
  player_invitations: null,
  player_claim_requests: null,
  player_merges: null,
  notification_configs: null,
  calendar_blocks: "other",
  push_subscriptions: null,
  device_tokens: null,
  blocked_users: null,
};

export type BucketCounts = Partial<Record<MergeBucket, number>>;

function bucketise(counts: Record<string, number> | undefined): BucketCounts {
  const out: BucketCounts = {};
  for (const [table, n] of Object.entries(counts ?? {})) {
    if (!n) continue;
    const bucket = table in TABLE_BUCKET ? TABLE_BUCKET[table] : "other";
    if (bucket === null) continue;
    out[bucket] = (out[bucket] ?? 0) + n;
  }
  return out;
}

/**
 * `moved`: what will be on the student's account afterwards and was the placeholder's,
 * including what merges into an existing record or thread (nothing in `merged` is lost).
 * `kept`: placeholder rows discarded because the student already had the same fact for the
 * same occasion — the student's own row is kept.
 */
export function summarizeMergePlan(plan: MergePlan | null | undefined): { moved: BucketCounts; kept: BucketCounts } {
  if (!plan) return { moved: {}, kept: {} };
  const moved = bucketise(plan.moves);
  for (const [bucket, n] of Object.entries(bucketise(plan.merged)) as [MergeBucket, number][]) {
    moved[bucket] = (moved[bucket] ?? 0) + n;
  }
  return { moved, kept: bucketise(plan.dropped) };
}

/** The buckets with a count, in speaking order. */
export function bucketEntries(counts: BucketCounts): Array<{ bucket: MergeBucket; count: number }> {
  return MERGE_BUCKETS.filter((b) => (counts[b] ?? 0) > 0).map((b) => ({ bucket: b, count: counts[b] as number }));
}

/** "a, b and c" — `and` is the translated conjunction. */
export function joinSpoken(items: string[], and: string): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;
}

/** The translator shape both apps have: i18next's `t` with options. */
export type MergeT = (key: string, options?: Record<string, unknown>) => string;

/**
 * The two sentences the apps show (players.claim rule 5j), already translated:
 * `moves` ("2 attendances, 1 evaluation and 1 class move to your account.") and `kept`
 * ("1 attendance you already had stays as it is."), each `null` when there is nothing to
 * say. `whose` is who is reading: the student ("yours") or the coach ("theirs").
 * Keys live under `players.claim`.
 */
export function describeMergePlan(
  plan: MergePlan | null | undefined,
  t: MergeT,
  whose: "yours" | "theirs"
): { moves: string | null; kept: string | null } {
  const { moved, kept } = summarizeMergePlan(plan);
  const and = t("players.claim.and");
  const spoken = (counts: BucketCounts) =>
    joinSpoken(
      bucketEntries(counts).map(({ bucket, count }) => t(`players.claim.bucket.${bucket}`, { count })),
      and
    );
  const movedItems = spoken(moved);
  const keptItems = spoken(kept);
  const suffix = whose === "yours" ? "Yours" : "Theirs";
  return {
    moves: movedItems ? t(`players.claim.previewMoves${suffix}`, { items: movedItems }) : null,
    kept: keptItems ? t(`players.claim.previewKept${suffix}`, { items: keptItems }) : null,
  };
}
