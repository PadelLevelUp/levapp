// Core domain types for LevelUp

export type ClassType = 'academy' | 'private';
export type ClassInstanceStatus = 'scheduled' | 'canceled' | 'completed';
export type PresenceStatus = 'present' | 'absent';
export type AbsenceJustification = 'justified' | 'unjustified';
export type CalendarBlockType = 'break' | 'holiday' | 'off_work' | 'personal';
export type PlayerSide = 'left' | 'right';

export interface Coach {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatarUrl?: string;
}

export interface Student {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
}

export interface CoachLevel {
  id: string;
  coachId: string;
  code: string;
  label: string;
  displayOrder: number;
}

export interface CoachStudent {
  id: string;
  coachId: string;
  studentId: string;
  levelId?: string;
  side?: PlayerSide;
  notes?: string;
  student?: Student;
  level?: CoachLevel;
}

export interface RecurrenceRule {
  frequency: 'weekly' | 'biweekly' | 'monthly';
  daysOfWeek: number[]; // 0 = Sunday, 1 = Monday, etc.
  interval?: number;
}

export interface ParentClass {
  id: string;
  coachId: string;
  type: ClassType;
  isRecurring: boolean;
  recurrenceRule?: RecurrenceRule;
  startDate: string;
  endDate?: string;
  defaultStartTime: string;
  defaultEndTime: string;
  defaultLevelId?: string;
  maxPlayers: number;
  name?: string;
  color?: string;
  status: 'active' | 'ended';
  participants?: Student[];
}

export interface ClassInstance {
  id: string;
  parentClassId?: string;
  coachId: string;
  date: string;
  startTime: string;
  endTime: string;
  status: ClassInstanceStatus;
  name?: string;
  color?: string;
  levelId?: string;
  maxPlayers: number;
  notes?: string;
  overriddenFields?: string[];
  parentClass?: ParentClass;
  participants?: Student[];
  presences?: Presence[];
}

export interface Presence {
  id: string;
  classInstanceId: string;
  studentId: string;
  status?: PresenceStatus;
  justification?: AbsenceJustification;
  invited: boolean;
  validated: boolean;
  student?: Student;
}

export interface CalendarBlock {
  id: string;
  coachId: string;
  type: CalendarBlockType;
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
  id: string;
  type: 'class' | 'block';
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
  data: ClassInstance | CalendarBlock;
}

export interface TimeSlot {
  hour: number;
  minute: number;
  label: string;
}

// Dashboard types
export interface DashboardStats {
  totalStudents: number;
  upcomingClasses: number;
  pendingValidations: number;
  monthlyRevenue: number;
}
