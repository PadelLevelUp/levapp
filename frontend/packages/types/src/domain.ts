// Core domain types for LevelUp

export type ClassType = 'academy' | 'private';
export type ClassInstanceStatus = 'scheduled' | 'canceled' | 'completed';
export type PresenceStatus = 'present' | 'absent';
export type AbsenceJustification = 'justified' | 'unjustified';
export type CalendarBlockType = 'break' | 'holiday' | 'off_work' | 'personal';
export type PlayerSide = 'left' | 'right' | 'both';

/**
 * i18n keys for a player's court side (PAD-182).
 *
 * The labels themselves live in the shared locale tree
 * (`src/locales/{pt,en}/players.json`) like every other user-facing string, so a
 * badge reads "Direita" in a Portuguese app and "Right" in an English one on both
 * shells. Call sites render them with react-i18next:
 *
 *     const { t } = useTranslation();
 *     t(SIDE_LABEL_KEYS[player.side])
 *
 * `PlayerSide` is a closed union, so this map is exhaustive — there is no
 * unknown-value branch to fall back on.
 */
export const SIDE_LABEL_KEYS: Record<PlayerSide, string> = {
  left: 'players.sideLeft',
  right: 'players.sideRight',
  both: 'players.sideBoth',
};

export interface PlayerEvaluation {
  categoryId: number;
  categoryName: string;
  score: number;
  scaleMin: number;
  scaleMax: number;
  evaluatedAt: string;
}

export interface EvaluationCategory {
  id: string;
  name: string;
  scaleMin: number;
  scaleMax: number;
}

export interface EvaluationEntryPayload {
  playerId: string;
  scores: { categoryId: string; value: number }[];
  strengths: CoachNote[];
  weaknesses: CoachNote[];
}

export interface CoachNote {
  id: number;
  text: string;
}

export interface PlayerProfile {
  playerId: string;
  evaluations: PlayerEvaluation[];
  strengths: CoachNote[];
  weaknesses: CoachNote[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
  abbreviation: string;
}

/** Entry in the blocked-users list (GET /app/blocked-users). */
export interface BlockedUser {
  id: string;
  name: string;
}

export interface Coach {
  id: string;
  userId: string;
  user?: User;
}

export interface Player {
  id: string;
  userId: string;
  user?: User;
}

export interface CoachLevel {
  id: string;
  coachId: string;
  code: string;
  label: string;
  displayOrder: number;
}

export interface Season {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

export interface CoachPlayer {
  id: string;
  coachId: string;
  playerId: string;
  userId: string;
  name: string,
  email: string,
  isActive: boolean,
  /** PAD-30: true once the player completed self-service registration (password set). */
  validated: boolean,
  /**
   * PAD-105: internal only. Coaches neither set nor see this — a coach-created
   * player carries a generated `pending-…` placeholder until the player picks
   * their own username at account activation. Do not render it in coach UI.
   */
  username: string,
  levelId?: string;
  side?: PlayerSide;
  notes?: string;
  level?: CoachLevel;
  phone?: string,
  /**
   * PAD-112: the student's own notification block preferences, surfaced to the
   * coach so a silent student reads as a deliberate choice rather than as
   * someone ignoring them. `notificationsBlocked` is derived server-side from
   * the three flags, so it can never disagree with them.
   *
   * Optional because a payload from an older backend simply omits them; the UI
   * treats "absent" as "not blocked".
   */
  notificationsBlocked?: boolean;
  blockAutoInvitations?: boolean;
  blockManualInvitations?: boolean;
  blockAllNotifications?: boolean;
  /** Written by the student, read-only for the coach. */
  notificationBlockReason?: string;
}

export interface RecurrenceRule {
  frequency: 'weekly' | 'biweekly' | 'monthly';
  daysOfWeek: number[]; // 0 = Sunday, 1 = Monday, etc.
  interval?: number;
}

export interface ClassInvitation {
  id: number;
  playerId: string;
  playerName: string;
  status: 'sent' | 'confirmed' | 'expired' | 'queued';
}

export interface ClassInstance {
  id: string;
  originalId: string;
  parentClassId?: string;
  coachId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: ClassInstanceStatus;
  classType?: string;
  name?: string;
  color?: string;
  levelId?: string;
  maxPlayers: number;
  notes?: string;
  recurrenceEnd?: string;
  isRecurring?: boolean;
  recurrenceRule?: { frequency: string; daysOfWeek: number[] } | null;
  overriddenFields?: string[];
  participants?: Player[];
  presences?: Presence[];
  notificationsEnabled?: boolean;
  invitations?: ClassInvitation[];
  plannedExerciseIds?: string[];
  // PAD-43/PAD-46: coach's effective cancellation deadline for this instance so
  // the student view can render deadline-aware cancel UX.
  cancellationDeadlineHours?: number;
  cancellationDeadline?: string | null;
  // PAD-73: the proactive-decline window. `proactiveDeclineDeadline` is the
  // instant the attendance reminder for this instance would fire (derived
  // server-side from the coach's reminder timing, never a fixed interval);
  // `canDeclineProactively` is the server's own answer to "is that window still
  // open right now?", so the UI never offers the action when the server would
  // classify the decline differently.
  proactiveDeclineDeadline?: string | null;
  canDeclineProactively?: boolean;
}

export interface Presence {
  id: string;
  lessonInstanceId: string;
  playerId: string;

  status?: 'present' | 'absent';
  justification?: 'justified' | 'unjustified';

  invited: boolean;
  confirmed: boolean;
  validated: boolean;

  player?: Player;
}

export interface CalendarBlock {
  id: string;
  coachId: string;
  type: 'break' | 'holiday' | 'off_work' | 'personal';

  date?: string;
  startTime?: string;
  endTime?: string;

  isRecurring: boolean;
  recurrenceRule?: RecurrenceRule;

  title?: string;
  description?: string;
}

// Calendar view types
export interface CalendarEvent {
  model: string,
  originalId: number,
  id: string;
  type: 'class' | 'block';
  isRecurring: boolean;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  color?: string;
  classType?: ClassType;
  blockType?: CalendarBlockType;
  status?: ClassInstanceStatus;
  /** Spots taken: enrolled minus declined. Includes players who have not answered. */
  participantCount?: number;
  /** Of those taken spots, how many actively confirmed. Always <= participantCount. */
  confirmedCount?: number;
  maxPlayers?: number;
  /** Coach level for this class, used for the block's level chip. */
  levelId?: string | number;
  isTemporary?: boolean;
}

export interface TimeSlot {
  hour: number;
  minute: number;
  label: string;
}

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
export type MessageActionType = 'class_invitation';

export interface MessageAction {
  type: MessageActionType;
  label: string;
  referenceId?: string;
  response?: 'accepted' | 'declined';
}

export interface Message {
  id: string;
  senderId: number;
  conversationId?: string | number;
  content: string;
  timestamp: string;
  isRead: boolean;
  status?: MessageStatus;
  replyTo?: string | number | null;
  edited?: boolean;
  isDeleted?: boolean;
  reactions?: { emoji: string; userId: string | number }[];
  actions?: MessageAction[];
  messageType?: string;
  metadata?: {
    notificationEventId?: number;
    lessonInstanceId?: number;
    responded?: boolean;
    response?: string;
    /** ISO start time of the class (on reminder messages), used to gate cancel. */
    startsAt?: string;
    /**
     * ISO cancellation deadline (start - cancellationDeadlineHours) when known.
     * PAD-46: lets the reminder-bubble cancel warn about a late cancellation,
     * consistent with the calendar class-detail view. Absent on older reminders.
     */
    cancellationDeadline?: string;
    superseded?: boolean;
    [key: string]: unknown;
  };
}

export interface Conversation {
  id: string;
  /**
   * Null when the other participant is gone (PAD-203 / messaging.conversations
   * rule 10) — a hard-deleted user, or a conversation whose participant row was
   * lost. The conversation is still listed; the server sends no display string
   * because it has no i18n, so render `messages.deletedUser` off
   * `participantDeleted`.
   */
  participantId: string | null;
  participantName: string | null;
  participantAvatar?: string;
  /** Role of the other participant, e.g. "coach" or "player" */
  participantRole?: string | null;
  /** True when there is no other participant left to describe */
  participantDeleted?: boolean;
  /** True when the other participant is the platform assistant (one-way channel) */
  isAssistant?: boolean;
  /**
   * messaging.block-and-report rule 7 (PAD-215): false when, for the viewer, the
   * other participant is not one of their coaches, shares no club with them, and
   * the viewer has never written in this thread. Drives the unknown-sender
   * banner. Absent on list payloads and on older backends → treat as known.
   */
  isKnownContact?: boolean;

  lastMessage: string | null;
  lastMessageAt: string | null;

  unreadCount: number;
  messages: Message[];
}

export type DashboardIcon =
  | "users"
  | "calendar"
  | "clipboard_check"
  | "trending_up"
  | "user_plus"
  | "check_circle"
  | "x_circle"
  | "mail";

/**
 * One "home" vocabulary for both roles (dashboard.blocks rule 3). The coach
 * gets next_class / needs_you / schedule_7d / week_pulse; the student gets
 * next_class / needs_you / schedule_7d / kpi_grid. `messages_overview` is
 * emitted for both and rendered by neither — the layout's unread badge reads
 * it. Which home a payload is comes from `DashboardDefinition.id`, never from
 * sniffing block types (rule 3b). PAD-202 removed `class_list` and `grid`.
 */
export type DashboardBlock =
  | DashboardMessagesOverviewBlock
  | DashboardKpiGridBlock
  | DashboardNextClassBlock
  | DashboardNeedsYouBlock
  | DashboardSchedule7dBlock
  | DashboardWeekPulseBlock;

/** Payload ids — the client's switch between the two homes. */
export const COACH_DASHBOARD_ID = "coach_default_v1";
export const PLAYER_DASHBOARD_ID = "player_default_v1";

/**
 * Hero: the class about to start.
 *
 * The backend omits this block entirely when nothing is scheduled — there is no
 * empty state, because the largest card on the screen saying "nothing" is the
 * flaw this redesign removes. Render nothing when it is absent.
 */
export interface DashboardNextClassBlock {
  id: string;
  type: "next_class";
  data: {
    classId: string;
    title: string;
    /** ISO date, `YYYY-MM-DD`. */
    date: string;
    /** `HH:mm`. */
    startTime: string;
    endTime: string;
    isToday: boolean;
    /** English weekday from the server; clients localise from `date`. */
    weekday: string;
    /**
     * Minutes until it starts, but only when the relative chip should show —
     * today and within two hours. `null` otherwise, so the client never has to
     * re-derive the rule.
     */
    minutesUntil: number | null;
    filled: number;
    capacity: number;
    /** Signed-up players for the avatar stack, already capped by the server. */
    players: Array<{ id: number; name: string; initials: string }>;
    href: string;
    /**
     * PAD-202 (student only): the materialised instance behind the class, or
     * `null` for a projected occurrence; and whether the student has been
     * asked to confirm and not yet answered — the switch for the Yes/No.
     */
    lessonInstanceId?: number | null;
    pendingConfirmation?: boolean;
  };
}

/** A class in the next 7 days that still has room. */
export interface DashboardNeedsYouEmptySeats {
  kind: "empty_seats";
  id: string;
  classTitle: string;
  seatsMissing: number;
  date: string;
  timeLabel: string;
  filled: number;
  capacity: number;
  href: string;
}

/** An unread inbound message — one per conversation, most recent first. */
export interface DashboardNeedsYouReply {
  kind: "reply";
  id: string;
  personName: string;
  initials: string;
  preview: string;
  href: string;
}

/**
 * PAD-202: a class the student was invited to and has neither confirmed nor
 * declined. Read from `Presence` — the same rows the Invites KPI counts.
 */
export interface DashboardNeedsYouInvite {
  kind: "invite";
  id: string;
  /** The materialised instance the Yes/No answers for (respond_reminder). */
  lessonInstanceId: number;
  classTitle: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  timeLabel: string;
  filled: number;
  capacity: number;
  href: string;
}

/** Attendances awaiting validation, scoped to classes that ended last week. */
export interface DashboardNeedsYouValidation {
  kind: "validation";
  id: string;
  count: number;
  classCount: number;
  href: string;
}

export type DashboardNeedsYouItem =
  | DashboardNeedsYouEmptySeats
  | DashboardNeedsYouInvite
  | DashboardNeedsYouReply
  | DashboardNeedsYouValidation;

/**
 * The queue. Every item carries its own resolution, so the list can reach zero —
 * which is the point of a queue, and what a bare counter could never do. Server
 * order is fixed: empty seats (soonest first), then replies, then validation.
 */
export interface DashboardNeedsYouBlock {
  id: string;
  type: "needs_you";
  data: {
    count: number;
    items: DashboardNeedsYouItem[];
  };
}

export interface DashboardSchedule7dBlock {
  id: string;
  type: "schedule_7d";
  data: {
    /** Every class in the window, not just the rows shipped below. */
    totalCount: number;
    items: Array<{
      id: string;
      title: string;
      date: string;
      /** English weekday from the server; clients localise from `date`. */
      weekday: string;
      dayOfMonth: number;
      timeLabel: string;
      filled: number;
      capacity: number;
      href: string;
      /** PAD-202 (student only) — see `DashboardNextClassBlock`. */
      lessonInstanceId?: number | null;
      pendingConfirmation?: boolean;
    }>;
    calendarHref: string;
  };
}

/**
 * Two metrics, each with a denominator. Never add a third — this block informs
 * without prompting, which is exactly why it sits last.
 */
export interface DashboardWeekPulseBlock {
  id: string;
  type: "week_pulse";
  data: {
    seatsFilled: {
      pct: number;
      filled: number;
      total: number;
      /** `null` when there is no prior week to compare — omit, never "+0%". */
      deltaPct: number | null;
      /** Seven daily fill percentages, oldest first. Desktop only. */
      trend: number[];
    };
    players: {
      active: number;
      total: number;
      idle: number;
    };
  };
}

export interface DashboardDefinition {
  id: string;
  title: string;
  blocks: DashboardBlock[];
}

export interface DashboardMessagesOverviewBlock {
  id: string;
  type: "messages_overview";
  data: {
    unreadMessages: number;
    conversationsToReply: number;
    latest?: {
      sender: string;
      preview: string;
    };
    href: string;
  };
}

export interface DashboardKpiGridBlock {
  id: string;
  type: "kpi_grid";
  data: {
    items: Array<{
      label: string;
      value: number | string;
      prefix?: string;
      icon: DashboardIcon;
      /**
       * PAD-202: the denominator that gives the number meaning — for
       * Attended/Missed, all recorded lessons. Absent on KPIs whose context is
       * fixed copy ("next 30 days", "to confirm").
       */
      total?: number;
      /**
       * Optional: only set when a matching frontend route exists. Items without
       * an href render as non-interactive cards (PAD-76 — a missing page must
       * not send the user to the 404 route).
       */
      href?: string;
    }>;
  };
}

// ── Notification engine types ──────────────────────────────────────────────

// ── Timing types ───────────────────────────────────────────────────────────

export interface TimingHoursBefore {
  type: "hours_before";
  value: number;
}

export interface TimingDaysBeforeAtTime {
  type: "days_before_at_time";
  days: number;
  time: string; // "HH:MM"
}

export type ReminderTiming = TimingHoursBefore | TimingDaysBeforeAtTime;

// ── Reminder config ────────────────────────────────────────────────────────

export interface ReminderConfig {
  firstReminder: ReminderTiming;
  reminderCount: number;
  hoursBetweenReminders: number;
  invitationStart: ReminderTiming;
}

// ── Invitation groups (replaces rounds + priority criteria) ────────────────

export interface GroupRule {
  attribute: string;
  operation: string;
  value?: string | number;
}

export interface InvitationGroup {
  id: string;
  rules: GroupRule[];
}

// ── Tiebreakers (replaces PriorityCriterion) ───────────────────────────────

export interface Tiebreaker {
  id: string;
  label: string;
  enabled: boolean;
}

// ── Restrictions (modified) ────────────────────────────────────────────────

export interface NotificationRestrictions {
  maxSimultaneous: { enabled: boolean; value: number };
  maxTotal: { enabled: boolean; value: number };
  maxInactiveTime: { enabled: boolean; value: number };
  minTimeBeforeClass: { enabled: boolean; value: number };
  maxInvitesPerStudentPerDay: { enabled: boolean; value: number };
  quietHours: { enabled: boolean };
  excludedPlayers: { enabled: boolean; playerIds: string[] };
  excludeUnpaidSubscription: { enabled: boolean };
  // Plain scalar (hours before class start). Cancellations after this window are
  // still allowed but flagged as "late cancellations". Backend key:
  // restrictions.cancellationDeadlineHours (default 24). See PAD-45 / PAD-43.
  cancellationDeadlineHours: number;
}

export interface NotificationGroup {
  id: string;
  label: string;
  enabled: boolean;
}

export interface StudentGroupPlayer {
  id: string;
  name: string;
  levelCode: string | null;
  levelId: string | null;
}

export interface StudentGroup {
  id: string;
  label: string;
  players: StudentGroupPlayer[];
}

// ── Message templates (expanded) ───────────────────────────────────────────

export interface MessageTemplates {
  invite: string;
  confirm: string;
  decline: string;
  spot_filled: string;
  reminder: string;
  reminder_followup: string;
  reminder_confirmed: string;
  reminder_declined: string;
  waiting_list_offer: string;
  waiting_list_placed: string;
}

// ── Main config (updated) ──────────────────────────────────────────────────

export type InvitationMode = "automatic" | "semi_automatic";

export interface NotificationConfig {
  autoNotifyEnabled: boolean;
  invitationMode?: InvitationMode;
  reminderTiming: ReminderConfig;
  invitationGroups: InvitationGroup[];
  tiebreakers: Tiebreaker[];
  restrictions: NotificationRestrictions;
  notificationGroups: NotificationGroup[];
  messageTemplates: MessageTemplates;
  /**
   * PAD-128 — the coach's standard eligibility bar (the minimum a student must
   * meet to join a class at all), or `null` when no bar is defined.
   *
   * `null` and `[]` both mean "everyone is eligible"; they are NOT the same as
   * a defined-but-unsatisfiable bar, which admits nobody. Never default this to
   * a rule set on the client either — the backend deliberately sends `null`
   * through so the two states stay distinguishable.
   *
   * Reuses `GroupRule`, but with a narrower vocabulary: level operations are
   * anchored to the class (`same_as_class`, `within_n_of_class`, …) rather than
   * to a vacancy, and only level and absence attributes are valid.
   */
  eligibilityRules?: GroupRule[] | null;
}

// ── Replacement approval (semi-automatic mode) ─────────────────────────────

export type ApprovalAction = "yes_now" | "yes_at_window" | "dismiss";

export type ApprovalVacancyResult =
  | "approved_now"
  | "approved_at_window"
  | "dismissed"
  | "stale";

export interface ApprovalQueuePlayer {
  /** Player id as serialized by the backend (string) */
  id: string;
  name: string;
  levelCode?: string | null;
  levelId?: string | null;
  roundNumber?: number;
  groupIndex?: number;
  groupLabel?: string;
}

// ---------------------------------------------------------------------------
// PAD-196 — notifications.invite-simulation ("Understand invites" tutorial)
// ---------------------------------------------------------------------------

/**
 * One failed rule, exactly as the backend's shared evaluator records it
 * (PAD-133, eligibility.enforcement rule 7a). `ladder_distance` is signed:
 * negative = the student is STRONGER than the class. `reason` names the
 * fail-closed cases where `actual`/`threshold` cannot be meaningful.
 */
export interface EligibilityFailure {
  attribute: string;
  operation: string;
  actual: string | number | boolean | null;
  threshold: string | number | boolean | null;
  ladder_distance: number | null;
  reason: string | null;
}

export type InviteSimulationGateCode =
  | "auto_notify_disabled"
  | "class_notifications_disabled"
  | "class_over"
  | "invitation_window"
  | "quiet_hours"
  | "min_time_before_class"
  | "max_total_reached";

export interface InviteSimulationGate {
  code: InviteSimulationGateCode;
  blocked: boolean;
  enabled?: boolean;
  /** invitation_window: naive-UTC ISO instant the window opens */
  opensAt?: string | null;
  /** quiet_hours: club-local wall clock ("07:00") */
  until?: string;
  /** quiet_hours: naive-UTC ISO instant the window ends, when blocked */
  untilAt?: string | null;
  /** min_time_before_class */
  minutes?: number | null;
  /** max_total_reached */
  sent?: number;
  limit?: number | null;
}

export interface InviteSimulationSpot {
  side: PlayerSide | null;
  levelId: string | null;
  levelCode: string | null;
  levelSource: "player" | "class" | "none";
}

export type InviteSendStatus = "first_batch" | "queued" | "daily_quota";

export type InviteSimulationPriority =
  | { id: "level"; ladderDistance: number | null; levelCode: string | null }
  | { id: "justified_misses"; rate: number }
  | { id: "attendance"; rate: number }
  | { id: "playing_side"; match: "exact" | "both" | "other"; side: PlayerSide | null }
  | { id: "subscription_status"; active: boolean };

export interface InviteSimulationCandidate {
  playerId: string;
  name: string | null;
  levelCode: string | null;
  levelId: string | null;
  side: PlayerSide | null;
  /** 1-based, within the round */
  rank: number;
  /** The coach's ENABLED priority criteria, in configured order */
  priority: InviteSimulationPriority[];
  sendStatus: InviteSendStatus;
}

export interface InviteSimulationRule {
  attribute: string;
  operation: string;
  value: string | number | null;
}

export interface InviteSimulationRound {
  number: number;
  kind: "group" | "legacy";
  label: string;
  /** Empty = everyone eligible */
  rules: InviteSimulationRule[];
  candidates: InviteSimulationCandidate[];
}

export interface InviteSimulation {
  /** naive-UTC ISO instant the answer was evaluated at */
  evaluatedAt: string;
  approvalRequired: boolean;
  gates: InviteSimulationGate[];
  waitingListPlacement: { playerId: string; name: string | null; standing: boolean } | null;
  spot: InviteSimulationSpot;
  rounds: InviteSimulationRound[];
}

export type InviteExplainStage =
  | "departing_player"
  | "already_enrolled"
  | "already_invited"
  | "eligibility"
  | "excluded_by_coach"
  | "inactive_account"
  | "unavailable"
  | "auto_invites_off"
  | "no_round_matched"
  | "invited";

export interface InviteExplain {
  playerId: string;
  name: string | null;
  stage: InviteExplainStage;
  details: {
    roundNumber?: number;
    rank?: number;
    sendStatus?: InviteSendStatus;
    failures?: EligibilityFailure[];
    rounds?: { number: number; failures: EligibilityFailure[] }[];
  };
}

/** The class is addressed exactly as `eligibility_check` addresses it. */
export interface InviteSimulationRequest {
  model: string;
  originalId: number | string;
  date: string | null;
  departingPlayerId: string | number;
}

export interface ApprovalVacancyInfo {
  vacancyId: number;
  declinedPlayerId: number;
  declinedPlayerName: string;
  queue: ApprovalQueuePlayer[];
  waitingListPlayerId?: number;
  waitingListPlayerName?: string;
}

export interface ApprovalBundle {
  bundleId: string;
  lessonInstanceId: number;
  /** ISO datetime when the invitation window opens; null if already open/unknown */
  windowOpenAt: string | null;
  responded: boolean;
  response?: ApprovalAction;
  vacancies: ApprovalVacancyInfo[];
}

export interface StandingWaitingListEntry {
  id: number;
  playerId: number;
  playerName: string | null;
  creditsUsed: number;
  creditsTotal: number;
  expiresAt: string;
  createdAt: string;
  activeClassCount: number;
}

export interface NotificationEventItem {
  id: string;
  type: 'manual' | 'auto';
  roundNumber: number;
  status: 'sent' | 'confirmed' | 'expired' | 'queued';
  createdAt: string;
  lessonInstance: { id: string; title: string | null; startDatetime: string | null };
  player: { id: string; name: string | null };
}

export type Phase =
  | "idle"
  | "selecting"
  | "uploading"
  | "processing"
  | "analyzing"
  | "validating"
  | "done";

export interface ThinkingLine {
  text: string;
  done: boolean;
}

export interface ImportTableRow {
  id: string;
  cells: Record<string, string>;
  selected: boolean;
}
export interface ImportTable {
  name: string;
  icon: string;
  columns: string[];
  rows: ImportTableRow[];
  allSelected: boolean;
  expanded: boolean;
}

// ── Attendance history (PAD-114) ────────────────────────────────────────────
// Payload of `GET /app/attendance_history` — the "Presenças" page. The server
// picks the bucket size when the client does not pin one and always echoes the
// one it used, so the chart labels its axis from the response rather than
// re-deriving the rule (spec `attendance.history` rule 4).

export type AttendanceGranularity = "day" | "month" | "year";

export interface AttendanceBucket {
  /** ISO date of the period start (day, first of month, or first of year). */
  start: string;
  count: number;
}

export interface AttendanceSession {
  lessonInstanceId: number;
  /** Calendar event id for this occurrence, always `lessoninstance-<id>`. */
  calendarEventId: string;
  title: string;
  /** ISO datetime (naive UTC) of the class start. */
  startDatetime: string;
  /** `YYYY-MM-DD` of the class. */
  date: string;
  color?: string | null;
  /** Calendar deep link — `dashboard.navigation` rule 8. */
  href: string;
}

export interface AttendanceHistory {
  playerId: number;
  playerName?: string | null;
  from: string;
  to: string;
  granularity: AttendanceGranularity;
  total: number;
  buckets: AttendanceBucket[];
  sessions: AttendanceSession[];
}

// ── Absence history (PAD-141) ───────────────────────────────────────────────
// Payload of `GET /app/absence_history` — the "Faltas" page. Deliberately the
// same shape as the attendance history: the two endpoints share one backend
// code path and differ only in which `Presence.status` they select, so modelling
// them as one shape keeps that guarantee visible in the types.
//
// The only addition is `justification` on each session. It labels a row
// justified/unjustified; it never filters the set, because the dashboard
// "Missed" KPI counts absences regardless of justification and the page must
// agree with the card that links to it (spec `attendance.absences` rule 3).

// `AbsenceJustification` is already declared at the top of this file; PAD-141
// re-declared it here, which is a TS2300 duplicate-identifier error. `vite
// build` strips types without checking them, so it shipped. Removed rather than
// renamed — the original is the one every other consumer imports.

export interface AbsenceSession extends AttendanceSession {
  /** Null when the coach recorded the absence without classifying it. */
  justification?: AbsenceJustification | null;
}

export interface AbsenceHistory extends Omit<AttendanceHistory, "sessions"> {
  sessions: AbsenceSession[];
}

/* ------------------------------------------------------------------ */
/* PAD-140 — the coach-facing Presences tab                            */
/* ------------------------------------------------------------------ */

/** One roster player's aggregates over the selected window. */
export interface PresencePlayerStats {
  playerId: number;
  name: string;
  /** Classes attended (`status === "present"`). Equals private + academy. */
  total: number;
  private: number;
  academy: number;
  justified: number;
  unjustified: number;
  /**
   * Guest appearances — classes the player was invited into without being
   * enrolled in the parent lesson. NOT derived from `Presence.invited`, which
   * is true for every enrolled player and so identifies nobody.
   */
  invitesReceived: number;
  /** Of those, the ones they actually turned up to. */
  invitesJoined: number;
}

export interface PresenceStatsTotals {
  presences: number;
  activePlayers: number;
  private: number;
  academy: number;
  /** Whole percent, already guarded against an empty window server-side. */
  academyShare: number;
  guestAttendances: number;
  justified: number;
  unjustified: number;
}

export interface PresenceStats {
  from: string;
  to: string;
  players: PresencePlayerStats[];
  totals: PresenceStatsTotals;
}

export interface PresenceTrend {
  from: string;
  to: string;
  granularity: AttendanceGranularity;
  total: number;
  buckets: AttendanceBucket[];
}

/** How a player answered before the class ran. */
export type PresenceResponse = 'confirmed' | 'declined' | 'none';

export interface PendingValidationPlayer {
  presenceId: number;
  playerId: number;
  name: string;
  response: PresenceResponse;
  status: PresenceStatus | null;
  justification: AbsenceJustification | null;
  validated: boolean;
  lateCancellation: boolean;
  guest: boolean;
}

export interface PendingValidationClass {
  lessonInstanceId: number;
  calendarEventId: string;
  title: string;
  type: 'academy' | 'private' | null;
  color?: string | null;
  startDatetime: string;
  date: string;
  players: PendingValidationPlayer[];
  /** How many players never answered — the only thing that blocks validating. */
  unanswered: number;
  ready: boolean;
}

export interface PendingValidation {
  from: string;
  to: string;
  pending: PendingValidationClass[];
  validated: PendingValidationClass[];
  pendingCount: number;
}
