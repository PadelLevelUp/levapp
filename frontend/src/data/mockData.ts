import type {
  User,
  Coach,
  Player,
  CoachLevel,
  CoachPlayer,
  ClassInstance,
  CalendarBlock,
  CalendarEvent,
  Presence,
  ClassType,
} from "@/types";
import { addDays, format, startOfWeek } from "date-fns";

// Would come from auth in a real app
export const MOCK_COACH_ID = "coach-1";

/**
 * Users
 */
export const mockCoachUser: User = {
  id: "user-coach-1",
  name: "Bernardo Terroso",
  email: "bernardo.terroso@levelup.com",
  phone: "+351 910 000 000",
  abbreviation: "BT",
};

export const mockUsers: User[] = [
  mockCoachUser,
  {
    id: "user-player-1",
    name: "Pedro Pacheco",
    email: "pedropacheco@gmail.com",
    phone: "+351 918966340",
    abbreviation: "PP",
  },
  {
    id: "user-player-2",
    name: "Tomás Pacheco",
    email: "tomaspacheco@gmail.com",
    phone: "+34 623 456 789",
    abbreviation: "TP",
  },
  {
    id: "user-player-3",
    name: "Bernardo Castro",
    email: "bernardoc@gmail.com",
    abbreviation: "BC",
  },
  {
    id: "user-player-4",
    name: "Dudas BF",
    email: "dudasbf@gmail.com",
    phone: "+351 911 111 111",
    abbreviation: "DB",
  },
  {
    id: "user-player-5",
    name: "Talinho Garrett",
    email: "talinho@gmail.com",
    abbreviation: "TG",
  },
  {
    id: "user-player-6",
    name: "António Neto",
    email: "antonioneto@gmail.com",
    phone: "+351 912 222 222",
    abbreviation: "AN",
  },
  {
    id: "user-player-7",
    name: "Diogo Malafaya",
    email: "diogom@gmail.com",
    abbreviation: "DM",
  },
  {
    id: "user-player-8",
    name: "João Magalhães",
    email: "joaom@gmail.com",
    abbreviation: "JM",
  },
];

export const mockCoach: Coach = {
  id: MOCK_COACH_ID,
  userId: mockCoachUser.id,
  user: mockCoachUser,
};

const playerUsers = mockUsers.filter((u) => u.id.startsWith("user-player-"));

/**
 * Players (note: Player = { id, userId, user? })
 */
export const mockPlayers: Player[] = playerUsers.map((u, idx) => ({
  id: `player-${idx + 1}`,
  userId: u.id,
  user: u,
}));

/**
 * Levels
 */
export const mockLevels: CoachLevel[] = [
  { id: "level-1", coachId: MOCK_COACH_ID, code: "L1", label: "Principiante", displayOrder: 1 },
  { id: "level-2", coachId: MOCK_COACH_ID, code: "L2", label: "Intermédio", displayOrder: 2 },
  { id: "level-3", coachId: MOCK_COACH_ID, code: "L3", label: "Avançado", displayOrder: 3 },
  { id: "level-4", coachId: MOCK_COACH_ID, code: "L3+", label: "Competição", displayOrder: 4 },
];

/**
 * CoachPlayer associations (note: CoachPlayer carries duplicated user fields)
 */
export const mockCoachPlayers: CoachPlayer[] = mockPlayers.map((player, index) => {
  const u = player.user!;
  const level = mockLevels[index % mockLevels.length];

  return {
    id: `coach-player-${index + 1}`,
    coachId: MOCK_COACH_ID,
    playerId: player.id,

    userId: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,

    isActive: true,
    username: u.email.split("@")[0],

    levelId: level.id,
    level,

    side: index % 2 === 0 ? "left" : "right",
    notes: index % 3 === 0 ? "Prefers volley drills." : undefined,
  };
});

/**
 * Dates for "this week"
 */
const today = new Date();
const weekStart = startOfWeek(today, { weekStartsOn: 1 });

/**
 * Recurring series ids (use ClassInstance.originalId to group instances)
 */
const SERIES = {
  academyBeginners: "series-1",
  academyAdvanced: "series-2",
  privatePedroTomas: "series-3",
} as const;

/**
 * Class instances
 * - ClassInstance.originalId is required (use a stable series id for recurring).
 * - ClassInstance.classType is optional (string), but we keep it aligned with ClassType.
 */
export const mockClassInstances: ClassInstance[] = [
  // Monday - Academy beginners (completed)
  {
    id: "instance-1",
    originalId: SERIES.academyBeginners,
    parentClassId: SERIES.academyBeginners,
    coachId: MOCK_COACH_ID,
    date: format(weekStart, "yyyy-MM-dd"),
    startTime: "09:00",
    endTime: "10:30",
    status: "completed",
    classType: "academy" satisfies ClassType,
    name: "Academia Principiantes",
    color: "#0ea5e9",
    levelId: "level-1",
    maxPlayers: 4,
    participants: [mockPlayers[0], mockPlayers[1], mockPlayers[2], mockPlayers[3]],
  },

  // Tuesday - Academy advanced (scheduled)
  {
    id: "instance-2",
    originalId: SERIES.academyAdvanced,
    parentClassId: SERIES.academyAdvanced,
    coachId: MOCK_COACH_ID,
    date: format(addDays(weekStart, 1), "yyyy-MM-dd"),
    startTime: "17:00",
    endTime: "18:30",
    status: "scheduled",
    classType: "academy" satisfies ClassType,
    name: "Academia Avançados",
    color: "#8b5cf6",
    levelId: "level-3",
    maxPlayers: 4,
    participants: [mockPlayers[4], mockPlayers[5], mockPlayers[6], mockPlayers[7]],
  },

  // Wednesday - Academy beginners (scheduled)
  {
    id: "instance-3",
    originalId: SERIES.academyBeginners,
    parentClassId: SERIES.academyBeginners,
    coachId: MOCK_COACH_ID,
    date: format(addDays(weekStart, 2), "yyyy-MM-dd"),
    startTime: "09:00",
    endTime: "10:30",
    status: "scheduled",
    classType: "academy" satisfies ClassType,
    name: "Academia Principiantes",
    color: "#0ea5e9",
    levelId: "level-1",
    maxPlayers: 4,
    participants: [mockPlayers[0], mockPlayers[1], mockPlayers[2], mockPlayers[3]],
  },

  // Thursday - Academy advanced (scheduled)
  {
    id: "instance-4",
    originalId: SERIES.academyAdvanced,
    parentClassId: SERIES.academyAdvanced,
    coachId: MOCK_COACH_ID,
    date: format(addDays(weekStart, 3), "yyyy-MM-dd"),
    startTime: "17:00",
    endTime: "18:30",
    status: "scheduled",
    classType: "academy" satisfies ClassType,
    name: "Academia Avançados",
    color: "#8b5cf6",
    levelId: "level-3",
    maxPlayers: 4,
    participants: [mockPlayers[4], mockPlayers[5], mockPlayers[6], mockPlayers[7]],
  },

  // Friday - recurring private (scheduled)
  {
    id: "instance-5",
    originalId: SERIES.privatePedroTomas,
    parentClassId: SERIES.privatePedroTomas,
    coachId: MOCK_COACH_ID,
    date: format(addDays(weekStart, 4), "yyyy-MM-dd"),
    startTime: "11:00",
    endTime: "12:00",
    status: "scheduled",
    classType: "private" satisfies ClassType,
    name: "Aula privada Pedro & Tomás",
    color: "#ec4899",
    maxPlayers: 2,
    participants: [mockPlayers[0], mockPlayers[1]],
  },

  // Friday - one-off private (scheduled)
  {
    id: "instance-6",
    originalId: "instance-6", // one-off: originalId can equal id
    coachId: MOCK_COACH_ID,
    date: format(addDays(weekStart, 4), "yyyy-MM-dd"),
    startTime: "16:00",
    endTime: "17:00",
    status: "scheduled",
    classType: "private" satisfies ClassType,
    name: "Privada Bernardo",
    color: "#f97316",
    maxPlayers: 1,
    participants: [mockPlayers[2]],
  },

  // Saturday - group (scheduled)
  {
    id: "instance-7",
    originalId: "instance-7",
    coachId: MOCK_COACH_ID,
    date: format(addDays(weekStart, 5), "yyyy-MM-dd"),
    startTime: "10:00",
    endTime: "11:30",
    status: "scheduled",
    classType: "academy" satisfies ClassType,
    name: "Grupo Sábado",
    color: "#22c55e",
    levelId: "level-2",
    maxPlayers: 4,
    participants: [mockPlayers[2], mockPlayers[3], mockPlayers[6]],
  },
];

/**
 * Presences for completed class
 * - Presence.lessonInstanceId (not classInstanceId)
 * - invited/confirmed/validated are required booleans
 */
export const mockPresences: Presence[] = [
  {
    id: "presence-1",
    lessonInstanceId: "instance-1",
    playerId: "player-1",
    status: "present",
    invited: true,
    confirmed: true,
    validated: true,
    player: mockPlayers[0],
  },
  {
    id: "presence-2",
    lessonInstanceId: "instance-1",
    playerId: "player-2",
    status: "present",
    invited: true,
    confirmed: true,
    validated: true,
    player: mockPlayers[1],
  },
  {
    id: "presence-3",
    lessonInstanceId: "instance-1",
    playerId: "player-3",
    status: "absent",
    justification: "justified",
    invited: true,
    confirmed: false,
    validated: true,
    player: mockPlayers[2],
  },
  {
    id: "presence-4",
    lessonInstanceId: "instance-1",
    playerId: "player-4",
    status: "present",
    invited: true,
    confirmed: true,
    validated: false,
    player: mockPlayers[3],
  },
];

/**
 * Attach presences to the completed instance (optional field on ClassInstance)
 */
const presencesByInstanceId = new Map<string, Presence[]>();
for (const p of mockPresences) {
  const list = presencesByInstanceId.get(p.lessonInstanceId) ?? [];
  list.push(p);
  presencesByInstanceId.set(p.lessonInstanceId, list);
}
for (const inst of mockClassInstances) {
  const presences = presencesByInstanceId.get(inst.id);
  if (presences) inst.presences = presences;
}

/**
 * Calendar blocks
 */
export const mockCalendarBlocks: CalendarBlock[] = [
  {
    id: "block-1",
    coachId: MOCK_COACH_ID,
    type: "break",
    date: format(addDays(weekStart, 2), "yyyy-MM-dd"),
    startTime: "13:00",
    endTime: "14:00",
    isRecurring: false,
    title: "Almoço",
  },
  {
    id: "block-2",
    coachId: MOCK_COACH_ID,
    type: "personal",
    date: format(addDays(weekStart, 4), "yyyy-MM-dd"),
    startTime: "08:00",
    endTime: "10:00",
    isRecurring: false,
    title: "Consulta médico",
  },
];

/**
 * Dashboard stats (unchanged shape, but uses the rewritten arrays)
 */
export const mockDashboardStats = {
  totalPlayers: mockPlayers.length,
  upcomingClasses: mockClassInstances.filter((c) => c.status === "scheduled").length,
  pendingValidations: mockPresences.filter((p) => p.invited && p.confirmed && !p.validated).length,
  monthlyRevenue: 2450,
};

/**
 * Calendar events
 * - CalendarEvent.originalId must be a number, so we generate numeric ids.
 * - CalendarEvent has no `data` field in your type.
 */
const classInstanceEvents: CalendarEvent[] = mockClassInstances.map((instance, idx) => ({
  model: "class_instance",
  originalId: idx + 1,
  id: `class-${instance.id}`,
  type: "class",
  isRecurring: instance.originalId !== instance.id,
  title: instance.name ?? "Aula",
  date: instance.date,
  startTime: instance.startTime,
  endTime: instance.endTime,
  color: instance.color,
  classType: (instance.classType as ClassType | undefined),
  status: instance.status,
  participantCount: instance.participants?.length ?? 0,
  maxPlayers: instance.maxPlayers,
}));

const calendarBlockEvents: CalendarEvent[] = mockCalendarBlocks.map((block, idx) => ({
  model: "calendar_block",
  originalId: 10_000 + idx + 1,
  id: `block-${block.id}`,
  type: "block",
  isRecurring: block.isRecurring,
  title: block.title ?? block.type,
  date: block.date ?? format(today, "yyyy-MM-dd"),
  startTime: block.startTime ?? "00:00",
  endTime: block.endTime ?? "23:59",
  blockType: block.type,
}));

export const mockCalendarEvents: CalendarEvent[] = [
  ...classInstanceEvents,
  ...calendarBlockEvents,
];
