// Core domain types for LevelUp

export type ClassType = 'academy' | 'private';
export type ClassInstanceStatus = 'scheduled' | 'canceled' | 'completed';
export type PresenceStatus = 'present' | 'absent';
export type AbsenceJustification = 'justified' | 'unjustified';
export type CalendarBlockType = 'break' | 'holiday' | 'off_work' | 'personal';
export type PlayerSide = 'left' | 'right';

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

export interface CoachPlayer {
  id: string;
  coachId: string;
  playerId: string;
  userId: string;
  name: string,
  email: string,
  isActive: boolean,
  username: string,
  levelId?: string;
  side?: 'left' | 'right';
  notes?: string;
  level?: CoachLevel;
  phone?: string,
}

export interface RecurrenceRule {
  frequency: 'weekly' | 'biweekly' | 'monthly';
  daysOfWeek: number[]; // 0 = Sunday, 1 = Monday, etc.
  interval?: number;
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
  overriddenFields?: string[];
  participants?: Player[];
  presences?: Presence[];
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

export interface Message {
  id: string;
  senderId: number;
  content: string;
  timestamp: string;
  isRead: boolean;
}

export interface Conversation {
  id: string;
  participantId: string;
  participantName: string;
  participantAvatar?: string;

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
  | DashboardGridBlock;

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