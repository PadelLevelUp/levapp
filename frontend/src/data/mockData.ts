import { 
  User,
  Player, 
  CoachLevel, 
  CoachPlayer,
  ClassInstance, 
  CalendarBlock,
  CalendarEvent,
  Presence
} from '@/types';
import { addDays, format, subDays, startOfWeek } from 'date-fns';

// Coach ID (would come from auth in real app)
export const MOCK_COACH_ID = 'coach-1';

export const mockUser: User = { 
  id: 'user-1', 
  name: 'Bernardo Terroso', 
  abbreviation: 'BT',
}

// Players
export const mockPlayers: Player[] = [
  { id: 'player-1', name: 'Pedro Pacheco', email: 'pedropacheco@gmail.com', phone: '+351 918966340' },
  { id: 'player-2', name: 'Tomás Pacheco', email: 'tomaspacheco@gmail.com', phone: '+34 623 456 789' },
  { id: 'player-3', name: 'Bernardo Castro', email: 'bernardoc@gmail.com' },
  { id: 'player-4', name: 'Dudas BF', email: 'dudasbf@gmail.com', phone: '+351 911 111 111' },
  { id: 'player-5', name: 'Talinho Garrett', email: 'talinho@gmail.com' },
  { id: 'player-6', name: 'António Neto', email: 'antonioneto@gmail.com', phone: '+351 912 222 222' },
  { id: 'player-7', name: 'Diogo Malafaya', email: 'diogom@gmail.com' },
  { id: 'player-8', name: 'João Magalhães', email: 'joaom@gmail.com' },
];

// Levels
export const mockLevels: CoachLevel[] = [
  { id: 'level-1', coachId: MOCK_COACH_ID, code: 'L1', label: 'Principiante', displayOrder: 1 },
  { id: 'level-2', coachId: MOCK_COACH_ID, code: 'L2', label: 'Intermédio', displayOrder: 2 },
  { id: 'level-3', coachId: MOCK_COACH_ID, code: 'L3', label: 'Avançado', displayOrder: 3 },
  { id: 'level-4', coachId: MOCK_COACH_ID, code: 'L3+', label: 'Competição', displayOrder: 4 },
];

// Coach-Player associations
export const mockCoachPlayers: CoachPlayer[] = mockPlayers.map((player, index) => ({
  id: `coach-player-${index + 1}`,
  coachId: MOCK_COACH_ID,
  playerId: player.id,
  levelId: mockLevels[index % mockLevels.length].id,
  side: index % 2 === 0 ? 'left' : 'right',
  player,
  level: mockLevels[index % mockLevels.length],
}));

// Generate dates for this week
const today = new Date();
const weekStart = startOfWeek(today, { weekStartsOn: 1 });

// Parent Classes
export const mockParentClasses: Lesson[] = [
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
    name: 'Academia Principiantes',
    color: '#0ea5e9',
    status: 'active',
    participants: [mockPlayers[0], mockPlayers[1], mockPlayers[2], mockPlayers[3]],
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
    name: 'Academia Avançados',
    color: '#8b5cf6',
    status: 'active',
    participants: [mockPlayers[4], mockPlayers[5], mockPlayers[6], mockPlayers[7]],
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
    name: 'Aula privada Pedro & Tomás',
    color: '#ec4899',
    status: 'active',
    participants: [mockPlayers[0], mockPlayers[1]],
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
    name: 'Academia Principiantes',
    color: '#0ea5e9',
    levelId: 'level-1',
    maxPlayers: 4,
    participants: [mockPlayers[0], mockPlayers[1], mockPlayers[2], mockPlayers[3]],
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
    name: 'Academia Avançados',
    color: '#8b5cf6',
    levelId: 'level-3',
    maxPlayers: 4,
    participants: [mockPlayers[4], mockPlayers[5], mockPlayers[6], mockPlayers[7]],
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
    name: 'Academia Principiantes',
    color: '#0ea5e9',
    levelId: 'level-1',
    maxPlayers: 4,
    participants: [mockPlayers[0], mockPlayers[1], mockPlayers[2], mockPlayers[3]],
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
    name: 'Academia Avançados',
    color: '#8b5cf6',
    levelId: 'level-3',
    maxPlayers: 4,
    participants: [mockPlayers[4], mockPlayers[5], mockPlayers[6], mockPlayers[7]],
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
    name: 'Aula privada Pedro & Tomás',
    color: '#ec4899',
    maxPlayers: 2,
    participants: [mockPlayers[0], mockPlayers[1]],
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
    name: 'Privada Bernardo',
    color: '#f97316',
    maxPlayers: 1,
    participants: [mockPlayers[2]],
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
    participants: [mockPlayers[2], mockPlayers[3], mockPlayers[6]],
  },
];

// Presences for completed class
export const mockPresences: Presence[] = [
  { id: 'presence-1', classInstanceId: 'instance-1', playerId: 'player-1', status: 'present', invited: true, validated: true, player: mockPlayers[0] },
  { id: 'presence-2', classInstanceId: 'instance-1', playerId: 'player-2', status: 'present', invited: true, validated: true, player: mockPlayers[1] },
  { id: 'presence-3', classInstanceId: 'instance-1', playerId: 'player-3', status: 'absent', justification: 'justified', invited: true, validated: true, player: mockPlayers[2] },
  { id: 'presence-4', classInstanceId: 'instance-1', playerId: 'player-4', status: 'present', invited: true, validated: false, player: mockPlayers[3] },
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
    title: 'Almoço',
  },
  {
    id: 'block-2',
    coachId: MOCK_COACH_ID,
    type: 'personal',
    date: format(addDays(weekStart, 4), 'yyyy-MM-dd'),
    startTime: '08:00',
    endTime: '10:00',
    isRecurring: false,
    title: 'Consulta médico',
  },
];

// Dashboard stats
export const mockDashboardStats = {
  totalPlayers: mockPlayers.length,
  upcomingClasses: mockClassInstances.filter(c => c.status === 'scheduled').length,
  pendingValidations: 2,
  monthlyRevenue: 2450,
};

const classInstanceEvents: CalendarEvent[] = mockClassInstances.map(
  (instance) => ({
    model: 'lesson_instance',
    originalId: instance.id,
    id: `lesson-${instance.id}`,
    type: "class",
    title: instance.name,
    date: instance.date,
    startTime: instance.startTime,
    endTime: instance.endTime,
    color: instance.color,
    status: instance.status,
    data: instance,
  })
);

const calendarBlockEvents: CalendarEvent[] = mockCalendarBlocks.map(
  (block) => ({
    id: `block-${block.id}`,
    type: "block",
    title: block.title ?? block.type,
    date: block.date,
    startTime: block.startTime ?? null,
    endTime: block.endTime ?? null,
    data: block, // 🔥 REQUIRED
  })
);

export const mockCalendarEvents: CalendarEvent[] = [
  ...classInstanceEvents,
  ...calendarBlockEvents,
];