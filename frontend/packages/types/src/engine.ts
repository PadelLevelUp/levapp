/**
 * PAD-920 — the new invitation engine's wire shapes, as the client reads them (swap step 8).
 * Specs: notifications.invitations NB1, calendar.event-detail ND1, classes.instance-enrollment
 * rule 15, classes.join-requests NJ1, dashboard.blocks NA1, notifications.invite-simulation N2–N4,
 * notifications.semi-auto-approval N1/N2/N5, notifications.config rule 20, admin.engine-health
 * rules 10–11. Every shape here exists only for a coach on the new engine; old-engine payloads keep
 * their own types.
 */

import type { EligibilityFailure } from "./domain";

/** The side of an open spot type; null is "either side". */
export type EngineSide = "left" | "right" | null;

// ── The invitation bubble (notifications.invitations NB1) ─────────────────────

/** The stored state (NB1). "The class has started" is never stored: it is derived from `startsAt`. */
export type EngineInviteStateName =
  | "open"
  | "answered"
  | "sorry"
  | "reoffered"
  | "withdrawn"
  | "closed_same_hour";

/** `msg_metadata` of a new-engine `notification_invite` message. */
export interface EngineInviteMeta {
  engine: "new";
  invitationId: number;
  lessonInstanceId?: number;
  kind?: "invite" | "reoffer" | "waiting_list_invite";
  state: EngineInviteStateName;
  /** The class's real start, ISO UTC: at or after it the bubble has no buttons, whatever `state` says. */
  startsAt: string;
  response?: "yes" | "no" | null;
  answeredBy?: "student" | "coach" | null;
  /** The coach's copy only (the serializer never sends it to the student): ISO UTC end of counting. */
  countsUntil?: string | null;
}

/** `POST /app/notify/respond` and `/coach_respond` for a new-engine invitation. */
export interface EngineRespondBody {
  invitationId: number;
  action: "yes" | "no";
}

export type EngineRespondAction =
  | "confirmed"
  | "declined"
  | "sorry"
  | "reoffered"
  | "closed_same_hour"
  | "class_started";

export interface EngineRespondResult {
  action: EngineRespondAction;
  invitationId: number;
  duplicate?: boolean;
}

// ── A coach's add at a busy hour (classes.instance-enrollment rule 15) ───────

export interface BusySameHourClash {
  playerId: string;
  playerName: string;
  lessonInstanceId: number;
  title: string;
  /** ISO start of the other class. */
  start: string;
}

export interface BusySameHourBody {
  code: "busy_same_hour";
  clashes: BusySameHourClash[];
}

// ── Direct join refusals (classes.join-requests NJ1) ──────────────────────────

export type JoinRefusalCode =
  | "already_enrolled"
  | "class_closed"
  | "ineligible"
  | "side_full"
  | "busy_same_hour"
  | "already_on_list"
  | "has_spots"
  | "not_visible"
  | "spot_filled"
  | "not_pending";

export interface JoinRefusalBody {
  code: JoinRefusalCode | string;
  requestedSide?: "left" | "right" | null;
  /** `side_full`: the open sides, today's field. */
  sides?: Array<"left" | "right">;
}

// ── The coach alert (dashboard.blocks NA1) ────────────────────────────────────

export interface DashboardNeedsYouEngineAlert {
  kind: "engine_alert";
  id: string;
  lessonInstanceId: number;
  classTitle: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  /** "HH:MM". */
  startTime: string;
  reason: "no_candidate" | string;
  side: EngineSide;
  levelId: number | null;
  levelLabel: string | null;
  count: number;
  href: string;
}

// ── The dry run (notifications.invite-simulation N2–N5) ───────────────────────

export type EngineStage =
  | "in_session"
  | "said_no"
  | "removed_by_coach"
  | "busy_same_time"
  | "postponed"
  | "failed_eligibility"
  | "failed_tier_rule"
  | "invited_before"
  | "invited"
  | "invited_for_other_type"
  | "invited_earlier"
  | "waiting"
  | "not_in_pool";

export type EngineNotInPoolReasonCode =
  | "excluded_for_session"
  | "excluded_players"
  | "same_day_class"
  | "inactive_account"
  | "eligibility"
  | "blocks_auto_invitations"
  | "blocks_all"
  | "availability_blocker";

export interface EngineNotInPoolReason {
  code: EngineNotInPoolReasonCode | string;
  /** `eligibility` only: today's structured failure records. */
  failures?: EligibilityFailure[];
}

export interface EngineVerdict {
  playerId: string;
  /** invite-simulation N2 (c02ede988): named like a queue entry; optional for older payloads. */
  name?: string;
  nickname?: string | null;
  stage: EngineStage | string;
  tier: number | null;
  /** `not_in_pool` only. */
  reasons?: EngineNotInPoolReason[];
}

export interface EngineQueueEntry {
  playerId: string;
  name: string;
  nickname?: string | null;
  tier: number;
  rank: number;
}

/**
 * The spot type's wire shape, the one every new-engine payload uses (invite-simulation N2): `side`
 * left/right/null (either), `levelId` the coach_levels id and `levelLabel` its name, both null for
 * a type of any level.
 */
export interface EngineSpotTypeKey {
  side: EngineSide;
  levelId: number | null;
  levelLabel: string | null;
}

export interface EngineSpotType extends EngineSpotTypeKey {
  count: number;
  queue: EngineQueueEntry[];
  verdicts: EngineVerdict[];
}


// ── Semi-automatic approval (notifications.semi-auto-approval N1, N2, N4) ─────

export interface EngineApprovalSpotType extends EngineSpotTypeKey {
  queue: EngineQueueEntry[];
  emptyQueueReasons?: Array<{ stage: EngineStage | string; count: number }>;
}

export interface EngineApprovalState {
  engine: "new";
  state: "pending" | "dismissed" | "none";
  semiAutomatic: boolean;
  approved: string[];
  removed: string[];
  request?: {
    requestId: number;
    lessonInstanceId: number;
    spotTypes: EngineApprovalSpotType[];
  };
}

export interface EngineApprovalRespondBody {
  bundleId: number;
  action: "yes_now" | "dismiss";
  removed?: string[];
}

export interface EngineApprovalRespondResult {
  engine: "new";
  requestId: number;
  result: "approved" | "dismissed" | "stale";
  state?: EngineApprovalState["state"];
}

/** `msg_metadata` of a new-engine `replacement_approval` message (N4). */
export interface EngineApprovalMeta {
  engine: "new";
  requestId: number;
  lessonInstanceId: number;
  responded: boolean;
  spotTypes: Array<EngineSpotTypeKey & { queue: EngineQueueEntry[] }>;
}

/** `msg_metadata` of the coach alert's `engine_alert` message (dashboard.blocks NA3). */
export interface EngineAlertMeta extends EngineSpotTypeKey {
  engine: "new";
  lessonInstanceId: number;
  reason: string;
  count: number;
  /** class_href(event): `/calendar?classId=lessoninstance-<id>&date=<YYYY-MM-DD>`. */
  href: string;
  /** The class's club-local date, YYYY-MM-DD. */
  date: string;
}

/** Where a new-engine invitee came from (calendar.event-detail ND1); null is a manual invitation. */
export type InviteeTierSource = "coach_list" | "students_list" | "pool" | null;

// ── The coach's engine settings (notifications.config rule 20) ────────────────

export type EngineTimingMethod = "fixed" | "per_tier" | "progressive";

export interface EngineTimingPair {
  betweenRoundsMinutes: number | null;
  betweenGroupsMinutes: number | null;
}

export interface EngineConfig {
  maxAtATime: number | null;
  timing: EngineTimingPair & {
    method: EngineTimingMethod;
    /** `per_tier` only, in tier order: 0 the coach's list, 1 the students' list, then the groups. */
    perTier?: Array<EngineTimingPair | null>;
  };
  autoEntryBeforeAttendanceRequest: boolean;
  waitingListSideChoice: boolean;
}

export type EngineVersion = "old" | "new";

/** The waiting-list side a student picks when the coach turned the side choice on. */
export type WaitingListSides = "own" | "other" | "both";

// ── Support's engine block (admin.engine-health rule 10) ──────────────────────

export interface EngineHealthBlock {
  coaches: { old: number; new: number };
  sessions: { upcoming: number; next7Days: number };
  openSpots: {
    byType: Array<{ side: EngineSide; levelId: number | null; levelLabel: string | null; open: number }>;
    uncovered: number;
  };
  invitations: {
    counting: number;
    openNotCounting: number;
    byTier: Array<{ tier: number; counting: number; openNotCounting: number }>;
    sentLast24h: number;
  };
  approvals: { pending: number; dismissed: number };
  alerts: { byReason: Array<{ reason: string; count: number }> };
  outbox: { pending: number; stuckOver5Min: number };
  tick: { present: boolean; overdue: boolean; sessionFailures24h: number };
}
