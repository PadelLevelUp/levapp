import { 
  Student, 
  CoachLevel, 
  CoachStudent, 
  ParentClass, 
  ClassInstance, 
  CalendarBlock, 
  Presence 
} from '@/types';
import { addDays, format, subDays, startOfWeek } from 'date-fns';

// Coach ID (would come from auth in real app)
export const MOCK_COACH_ID = 'coach-1';

// Students
export const mockStudents: Student[] = [
  { id: 'student-1', name: 'Carlos García', email: 'carlos@email.com', phone: '+34 612 345 678' },
  { id: 'student-2', name: 'María López', email: 'maria@email.com', phone: '+34 623 456 789' },
  { id: 'student-3', name: 'Pablo Rodríguez', email: 'pablo@email.com' },
  { id: 'student-4', name: 'Ana Martínez', email: 'ana@email.com', phone: '+34 634 567 890' },
  { id: 'student-5', name: 'David Fernández', email: 'david@email.com' },
  { id: 'student-6', name: 'Laura Sánchez', email: 'laura@email.com', phone: '+34 645 678 901' },
  { id: 'student-7', name: 'Javier Ruiz', email: 'javier@email.com' },
  { id: 'student-8', name: 'Elena Torres', email: 'elena@email.com' },
];

// Levels
export const mockLevels: CoachLevel[] = [
  { id: 'level-1', coachId: MOCK_COACH_ID, code: 'L1', label: 'Iniciación', displayOrder: 1 },
  { id: 'level-2', coachId: MOCK_COACH_ID, code: 'L2', label: 'Intermedio', displayOrder: 2 },
  { id: 'level-3', coachId: MOCK_COACH_ID, code: 'L3', label: 'Avanzado', displayOrder: 3 },
  { id: 'level-4', coachId: MOCK_COACH_ID, code: 'L3+', label: 'Competición', displayOrder: 4 },
];

// Coach-Student associations
export const mockCoachStudents: CoachStudent[] = mockStudents.map((student, index) => ({
  id: `coach-student-${index + 1}`,
  coachId: MOCK_COACH_ID,
  studentId: student.id,
  levelId: mockLevels[index % mockLevels.length].id,
  side: index % 2 === 0 ? 'left' : 'right',
  student,
  level: mockLevels[index % mockLevels.length],
}));

// Generate dates for this week
const today = new Date();
const weekStart = startOfWeek(today, { weekStartsOn: 1 });

// Parent Classes
export const mockParentClasses: ParentClass[] = [
  {
    id: 'parent-1',
    coachId: MOCK_COACH_ID,
    type: 'academy',
    isRecurring: true,
    recurrenceRule: { frequency: 'weekly', daysOfWeek: [1, 3] }, // Monday, Wednesday
    startDate: format(subDays(today, 30), 'yyyy-MM-dd'),
    defaultStartTime: '09:00',
    defaultEndTime: '10:30',
    defaultLevelId: 'level-1',
    maxPlayers: 4,
    name: 'Academia Iniciación',
    color: '#0ea5e9',
    status: 'active',
    participants: [mockStudents[0], mockStudents[1], mockStudents[2], mockStudents[3]],
  },
  {
    id: 'parent-2',
    coachId: MOCK_COACH_ID,
    type: 'academy',
    isRecurring: true,
    recurrenceRule: { frequency: 'weekly', daysOfWeek: [2, 4] }, // Tuesday, Thursday
    startDate: format(subDays(today, 30), 'yyyy-MM-dd'),
    defaultStartTime: '17:00',
    defaultEndTime: '18:30',
    defaultLevelId: 'level-3',
    maxPlayers: 4,
    name: 'Academia Avanzado',
    color: '#8b5cf6',
    status: 'active',
    participants: [mockStudents[4], mockStudents[5], mockStudents[6], mockStudents[7]],
  },
  {
    id: 'parent-3',
    coachId: MOCK_COACH_ID,
    type: 'private',
    isRecurring: true,
    recurrenceRule: { frequency: 'weekly', daysOfWeek: [5] }, // Friday
    startDate: format(subDays(today, 14), 'yyyy-MM-dd'),
    defaultStartTime: '11:00',
    defaultEndTime: '12:00',
    maxPlayers: 2,
    name: 'Clase privada Carlos & María',
    color: '#ec4899',
    status: 'active',
    participants: [mockStudents[0], mockStudents[1]],
  },
];

// Class Instances for this week
export const mockClassInstances: ClassInstance[] = [
  // Monday - Academia Iniciación
  {
    id: 'instance-1',
    parentClassId: 'parent-1',
    coachId: MOCK_COACH_ID,
    date: format(weekStart, 'yyyy-MM-dd'),
    startTime: '09:00',
    endTime: '10:30',
    status: 'completed',
    name: 'Academia Iniciación',
    color: '#0ea5e9',
    levelId: 'level-1',
    maxPlayers: 4,
    participants: [mockStudents[0], mockStudents[1], mockStudents[2], mockStudents[3]],
    parentClass: mockParentClasses[0],
  },
  // Tuesday - Academia Avanzado
  {
    id: 'instance-2',
    parentClassId: 'parent-2',
    coachId: MOCK_COACH_ID,
    date: format(addDays(weekStart, 1), 'yyyy-MM-dd'),
    startTime: '17:00',
    endTime: '18:30',
    status: 'scheduled',
    name: 'Academia Avanzado',
    color: '#8b5cf6',
    levelId: 'level-3',
    maxPlayers: 4,
    participants: [mockStudents[4], mockStudents[5], mockStudents[6], mockStudents[7]],
    parentClass: mockParentClasses[1],
  },
  // Wednesday - Academia Iniciación
  {
    id: 'instance-3',
    parentClassId: 'parent-1',
    coachId: MOCK_COACH_ID,
    date: format(addDays(weekStart, 2), 'yyyy-MM-dd'),
    startTime: '09:00',
    endTime: '10:30',
    status: 'scheduled',
    name: 'Academia Iniciación',
    color: '#0ea5e9',
    levelId: 'level-1',
    maxPlayers: 4,
    participants: [mockStudents[0], mockStudents[1], mockStudents[2], mockStudents[3]],
    parentClass: mockParentClasses[0],
  },
  // Thursday - Academia Avanzado
  {
    id: 'instance-4',
    parentClassId: 'parent-2',
    coachId: MOCK_COACH_ID,
    date: format(addDays(weekStart, 3), 'yyyy-MM-dd'),
    startTime: '17:00',
    endTime: '18:30',
    status: 'scheduled',
    name: 'Academia Avanzado',
    color: '#8b5cf6',
    levelId: 'level-3',
    maxPlayers: 4,
    participants: [mockStudents[4], mockStudents[5], mockStudents[6], mockStudents[7]],
    parentClass: mockParentClasses[1],
  },
  // Friday - Private class
  {
    id: 'instance-5',
    parentClassId: 'parent-3',
    coachId: MOCK_COACH_ID,
    date: format(addDays(weekStart, 4), 'yyyy-MM-dd'),
    startTime: '11:00',
    endTime: '12:00',
    status: 'scheduled',
    name: 'Clase privada Carlos & María',
    color: '#ec4899',
    maxPlayers: 2,
    participants: [mockStudents[0], mockStudents[1]],
    parentClass: mockParentClasses[2],
  },
  // Friday - One-off private
  {
    id: 'instance-6',
    coachId: MOCK_COACH_ID,
    date: format(addDays(weekStart, 4), 'yyyy-MM-dd'),
    startTime: '16:00',
    endTime: '17:00',
    status: 'scheduled',
    name: 'Privada Pablo',
    color: '#f97316',
    maxPlayers: 1,
    participants: [mockStudents[2]],
  },
  // Saturday morning
  {
    id: 'instance-7',
    coachId: MOCK_COACH_ID,
    date: format(addDays(weekStart, 5), 'yyyy-MM-dd'),
    startTime: '10:00',
    endTime: '11:30',
    status: 'scheduled',
    name: 'Grupo Sábado',
    color: '#22c55e',
    levelId: 'level-2',
    maxPlayers: 4,
    participants: [mockStudents[2], mockStudents[3], mockStudents[6]],
  },
];

// Presences for completed class
export const mockPresences: Presence[] = [
  { id: 'presence-1', classInstanceId: 'instance-1', studentId: 'student-1', status: 'present', invited: true, validated: true, student: mockStudents[0] },
  { id: 'presence-2', classInstanceId: 'instance-1', studentId: 'student-2', status: 'present', invited: true, validated: true, student: mockStudents[1] },
  { id: 'presence-3', classInstanceId: 'instance-1', studentId: 'student-3', status: 'absent', justification: 'justified', invited: true, validated: true, student: mockStudents[2] },
  { id: 'presence-4', classInstanceId: 'instance-1', studentId: 'student-4', status: 'present', invited: true, validated: true, student: mockStudents[3] },
];

// Calendar blocks
export const mockCalendarBlocks: CalendarBlock[] = [
  {
    id: 'block-1',
    coachId: MOCK_COACH_ID,
    type: 'break',
    date: format(addDays(weekStart, 2), 'yyyy-MM-dd'),
    startTime: '13:00',
    endTime: '14:00',
    isRecurring: false,
    title: 'Almuerzo',
  },
  {
    id: 'block-2',
    coachId: MOCK_COACH_ID,
    type: 'personal',
    date: format(addDays(weekStart, 4), 'yyyy-MM-dd'),
    startTime: '08:00',
    endTime: '10:00',
    isRecurring: false,
    title: 'Cita médico',
  },
];

// Dashboard stats
export const mockDashboardStats = {
  totalStudents: mockStudents.length,
  upcomingClasses: mockClassInstances.filter(c => c.status === 'scheduled').length,
  pendingValidations: 2,
  monthlyRevenue: 2450,
};
