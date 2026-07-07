// Core domain types for LevelUp

export type ClassType = 'academy' | 'private';
export type ClassInstanceStatus = 'scheduled' | 'canceled' | 'completed';
export type PresenceStatus = 'present' | 'absent';
export type AbsenceJustification = 'justified' | 'unjustified';
export type CalendarBlockType = 'break' | 'holiday' | 'off_work' | 'personal';
export type PlayerSide = 'left' | 'right' | 'both';

// Human-readable label for a player's court side. Handles left/right/both plus
// any unexpected value gracefully. `locale` picks the language for the label set.
const SIDE_LABELS: Record<'en' | 'es', Record<PlayerSide, string>> = {
  en: { left: 'Left', right: 'Right', both: 'Both' },
  es: { left: 'Izquierda', right: 'Derecha', both: 'Ambos' },
};
const SIDE_LABELS_SHORT: Record<'en' | 'es', Record<PlayerSide, string>> = {
  en: { left: 'Left', right: 'Right', both: 'Both' },
  es: { left: 'Izq', right: 'Der', both: 'Ambos' },
};

export function sideLabel(
  side: PlayerSide | string | null | undefined,
  opts: { locale?: 'en' | 'es'; short?: boolean } = {}
): string {
  if (!side) return '';
  const { locale = 'en', short = false } = opts;
  const table = short ? SIDE_LABELS_SHORT[locale] : SIDE_LABELS[locale];
  return table[side as PlayerSide] ?? String(side);
}

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
  username: string,
  levelId?: string;
  side?: PlayerSide;
  notes?: string;
  level?: CoachLevel;
  phone?: string,
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
  participantCount?: number;
  maxPlayers?: number;
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
    [key: string]: unknown;
  };
}

export interface Conversation {
  id: string;
  participantId: string;
  participantName: string;
  participantAvatar?: string;
  /** Role of the other participant, e.g. "coach" or "player" */
  participantRole?: string;
  /** True when the other participant is the platform assistant (one-way channel) */
  isAssistant?: boolean;

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

export type DashboardBlock =
  | DashboardMessagesOverviewBlock
  | DashboardKpiGridBlock
  | DashboardClassListBlock
  | DashboardGridBlock
  | DashboardNotificationActivityBlock;

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

export interface DashboardGridBlock {
  id: string;
  type: "grid";
  data: {
    cols: {
      base: number;
      lg?: number;
    };
    children: DashboardBlock[];
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
      href: string;
    }>;
  };
}

export interface DashboardClassListBlock {
  id: string;
  type: "class_list";
  data: {
    title: string;
    icon?: DashboardIcon;
    emptyText?: string;
    items: Array<{
      id: string;
      title: string;
      dateLabel: string;
      timeLabel: string;
      color?: string;
      rightLabel?: string;
      badge?: string;
      href: string;
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

export interface DashboardNotificationActivityBlock {
  id: string;
  type: "notification_activity";
  data: {
    title: string;
    items: NotificationEventItem[];
  };
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
