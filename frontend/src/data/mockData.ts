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
  PlayerProfile,
  EvaluationCategory,
  Conversation,
  Message,
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

/**
 * Evaluation categories
 */
export const mockEvaluationCategories: EvaluationCategory[] = [
  { id: "cat-1", name: "Technique", scaleMin: 0, scaleMax: 100 },
  { id: "cat-2", name: "Tactics", scaleMin: 0, scaleMax: 100 },
  { id: "cat-3", name: "Physical Capacity", scaleMin: 0, scaleMax: 100 },
  { id: "cat-4", name: "Attitude", scaleMin: 0, scaleMax: 100 },
];

/**
 * Player profiles (evaluations, strengths, weaknesses)
 */
function buildProfile(
  playerId: string,
  evaluations: [string, number][],
  strengths: string[],
  weaknesses: string[],
): PlayerProfile {
  return {
    playerId,
    evaluations: evaluations.map(([topic, score]) => ({ topic, score })),
    strengths,
    weaknesses,
  };
}

export const mockPlayerProfiles: Record<string, PlayerProfile> = {
  "player-1": buildProfile("player-1",
    [["Technique", 78], ["Tactics", 65], ["Physical Capacity", 82], ["Attitude", 90]],
    ["Strong forehand", "Excellent court positioning", "High stamina"],
    ["Weak backhand under pressure", "Slow net transitions"]),
  "player-2": buildProfile("player-2",
    [["Technique", 70], ["Tactics", 80], ["Physical Capacity", 60], ["Attitude", 85]],
    ["Smart play selection", "Good doubles partner"],
    ["Needs conditioning improvement", "Inconsistent serve"]),
  "player-3": buildProfile("player-3",
    [["Technique", 55], ["Tactics", 50], ["Physical Capacity", 70], ["Attitude", 95]],
    ["Very motivated", "Great attitude in training"],
    ["Technique still developing", "Tactical awareness needs work"]),
  "player-4": buildProfile("player-4",
    [["Technique", 85], ["Tactics", 75], ["Physical Capacity", 68], ["Attitude", 72]],
    ["Natural racket skills", "Powerful smash"],
    ["Sometimes unfocused", "Endurance could improve"]),
  "player-5": buildProfile("player-5",
    [["Technique", 62], ["Tactics", 58], ["Physical Capacity", 90], ["Attitude", 88]],
    ["Exceptional fitness", "Never gives up on a point"],
    ["Technical polish needed", "Rushing shots"]),
  "player-6": buildProfile("player-6",
    [["Technique", 80], ["Tactics", 72], ["Physical Capacity", 75], ["Attitude", 80]],
    ["Consistent baseline play", "Good volleys"],
    ["Could be more aggressive", "Second serve needs work"]),
  "player-7": buildProfile("player-7",
    [["Technique", 48], ["Tactics", 45], ["Physical Capacity", 55], ["Attitude", 92]],
    ["Eager to learn", "Positive team player"],
    ["Beginner level technique", "Needs match experience"]),
  "player-8": buildProfile("player-8",
    [["Technique", 73], ["Tactics", 68], ["Physical Capacity", 72], ["Attitude", 78]],
    ["Well-rounded game", "Reliable under pressure"],
    ["Lacks a standout weapon", "Footwork could improve"]),
};

/**
 * Conversations & messages
 */
const COACH_SENDER_ID = 1;
const PLAYER_SENDER: Record<string, number> = {
  "player-1": 101,
  "player-2": 102,
  "player-3": 103,
  "player-4": 104,
  "player-5": 105,
};

const msg = (m: Message) => m;

export const mockConversations: Conversation[] = [
  {
    id: "conv-1",
    participantId: "player-1",
    participantName: "Pedro Pacheco",
    participantAvatar: undefined,
    lastMessage: "Perfect, see you tomorrow then! I'll arrive a bit earlier so we can warm up properly and review what we worked on last week.",
    lastMessageAt: "2024-01-15T10:30:00",
    unreadCount: 2,
    messages: [
      msg({ id: "msg-1", senderId: COACH_SENDER_ID, content: "Hi Pedro, how are you? I'm texting to confirm tomorrow's lesson.", timestamp: "2024-01-15T09:00:00", isRead: true }),
      msg({ id: "msg-2", senderId: PLAYER_SENDER["player-1"], content: "Hi! Yes, everything is confirmed. At 18:00 as usual?", timestamp: "2024-01-15T09:15:00", isRead: true }),
      msg({ id: "msg-3", senderId: COACH_SENDER_ID, content: "Exactly, 18:00 on court 3. Bring the new racket if you want to try it.", timestamp: "2024-01-15T09:20:00", isRead: true }),
      msg({ id: "msg-4", senderId: PLAYER_SENDER["player-1"], content: "Perfect, see you tomorrow then! I'll arrive a bit earlier so we can warm up properly and review what we worked on last week.", timestamp: "2024-01-15T10:30:00", isRead: false }),
    ],
  },
  {
    id: "conv-2",
    participantId: "player-2",
    participantName: "Tomás Pacheco",
    participantAvatar: undefined,
    lastMessage: "Thanks for today's lesson, I learned a lot about the backhand.",
    lastMessageAt: "2024-01-14T20:00:00",
    unreadCount: 0,
    messages: [
      msg({ id: "msg-5", senderId: PLAYER_SENDER["player-2"], content: "Hi coach! I wanted to ask if there's availability for an extra lesson this week.", timestamp: "2024-01-14T14:00:00", isRead: true }),
      msg({ id: "msg-6", senderId: COACH_SENDER_ID, content: "Hi Tomás! Let me check my schedule. I have a slot on Thursday at 17:00, does that work for you?", timestamp: "2024-01-14T14:30:00", isRead: true }),
      msg({ id: "msg-7", senderId: PLAYER_SENDER["player-2"], content: "Perfect! Thursday works great for me. Shall we work on the backhand?", timestamp: "2024-01-14T14:45:00", isRead: true }),
      msg({ id: "msg-8", senderId: COACH_SENDER_ID, content: "Of course, we'll focus on the backhand and the bandeja. Bring extra water!", timestamp: "2024-01-14T15:00:00", isRead: true }),
      msg({ id: "msg-9", senderId: PLAYER_SENDER["player-2"], content: "Thanks for today's lesson, I learned a lot about the backhand.", timestamp: "2024-01-14T20:00:00", isRead: true }),
    ],
  },
  {
    id: "conv-3",
    participantId: "player-3",
    participantName: "Bernardo Castro",
    participantAvatar: undefined,
    lastMessage: "Understood, I'll cancel Friday's lesson.",
    lastMessageAt: "2024-01-13T11:30:00",
    unreadCount: 0,
    messages: [
      msg({ id: "msg-10", senderId: COACH_SENDER_ID, content: "Hi Bernardo, just letting you know that I won't be able to give the lesson on Friday due to a personal commitment.", timestamp: "2024-01-13T11:00:00", isRead: true }),
      msg({ id: "msg-11", senderId: PLAYER_SENDER["player-3"], content: "Understood, I'll cancel Friday's lesson.", timestamp: "2024-01-13T11:30:00", isRead: true }),
    ],
  },
  {
    id: "conv-4",
    participantId: "player-4",
    participantName: "Dudas BF",
    participantAvatar: undefined,
    lastMessage: "Can we move Tuesday's lesson to Wednesday?",
    lastMessageAt: "2024-01-12T16:00:00",
    unreadCount: 1,
    messages: [
      msg({ id: "msg-12", senderId: PLAYER_SENDER["player-4"], content: "Can we move Tuesday's lesson to Wednesday?", timestamp: "2024-01-12T16:00:00", isRead: false }),
    ],
  },
  {
    id: "conv-5",
    participantId: "player-5",
    participantName: "Talinho Garrett",
    participantAvatar: undefined,
    lastMessage: "Perfect, thanks!",
    lastMessageAt: "2024-01-10T09:15:00",
    unreadCount: 0,
    messages: [
      msg({ id: "msg-13", senderId: COACH_SENDER_ID, content: "Talinho, remember to bring the new outfit for the group photo.", timestamp: "2024-01-10T09:00:00", isRead: true }),
      msg({ id: "msg-14", senderId: PLAYER_SENDER["player-5"], content: "Perfect, thanks!", timestamp: "2024-01-10T09:15:00", isRead: true }),
    ],
  },
];
