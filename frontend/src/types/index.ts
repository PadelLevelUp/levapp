// Core domain types for LevelUp

export type ClassType = 'academy' | 'private';
export type ClassInstanceStatus = 'scheduled' | 'canceled' | 'completed';
export type PresenceStatus = 'present' | 'absent';
export type AbsenceJustification = 'justified' | 'unjustified';
export type CalendarBlockType = 'break' | 'holiday' | 'off_work' | 'personal';
export type PlayerSide = 'left' | 'right';

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

// Dashboard types
export interface DashboardStats {
  totalPlayers: number;
  upcomingClasses: number;
  pendingValidations: number;
  monthlyRevenue: number;
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
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  messages: Message[];
}
