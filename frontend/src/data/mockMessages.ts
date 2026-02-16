import type { Conversation, Message } from "@/types";

/**
 * Message.senderId is a number in your types.
 * We'll use numeric sender ids:
 * - 1 = coach
 * - 101.. = players
 */
const COACH_SENDER_ID = 1;

const PLAYER_SENDER = {
  "player-1": 101,
  "player-2": 102,
  "player-3": 103,
  "player-4": 104,
  "player-5": 105,
} as const;

const msg = (m: Message) => m;

export const mockConversations: Conversation[] = [
  {
    id: "conv-1",
    participantId: "player-1",
    participantName: "Pedro Pacheco",
    participantAvatar: undefined,

    lastMessage:
      "Perfect, see you tomorrow then! I’ll arrive a bit earlier so we can warm up properly and review what we worked on last week.",
    lastMessageAt: "2024-01-15T10:30:00",

    unreadCount: 2,
    messages: [
      msg({
        id: "msg-1",
        senderId: COACH_SENDER_ID,
        content: "Hi Pedro, how are you? I’m texting to confirm tomorrow’s lesson.",
        timestamp: "2024-01-15T09:00:00",
        isRead: true,
      }),
      msg({
        id: "msg-2",
        senderId: PLAYER_SENDER["player-1"],
        content: "Hi! Yes, everything is confirmed. At 18:00 as usual?",
        timestamp: "2024-01-15T09:15:00",
        isRead: true,
      }),
      msg({
        id: "msg-3",
        senderId: COACH_SENDER_ID,
        content: "Exactly, 18:00 on court 3. Bring the new racket if you want to try it.",
        timestamp: "2024-01-15T09:20:00",
        isRead: true,
      }),
      msg({
        id: "msg-4",
        senderId: PLAYER_SENDER["player-1"],
        content:
          "Perfect, see you tomorrow then! I’ll arrive a bit earlier so we can warm up properly and review what we worked on last week.",
        timestamp: "2024-01-15T10:30:00",
        isRead: false,
      }),
    ],
  },

  {
    id: "conv-2",
    participantId: "player-2",
    participantName: "Tomás Pacheco",
    participantAvatar: undefined,

    lastMessage: "Thanks for today’s lesson, I learned a lot about the backhand.",
    lastMessageAt: "2024-01-14T20:00:00",

    unreadCount: 0,
    messages: [
      msg({
        id: "msg-5",
        senderId: PLAYER_SENDER["player-2"],
        content: "Hi coach! I wanted to ask if there’s availability for an extra lesson this week.",
        timestamp: "2024-01-14T14:00:00",
        isRead: true,
      }),
      msg({
        id: "msg-6",
        senderId: COACH_SENDER_ID,
        content: "Hi Tomás! Let me check my schedule. I have a slot on Thursday at 17:00, does that work for you?",
        timestamp: "2024-01-14T14:30:00",
        isRead: true,
      }),
      msg({
        id: "msg-7",
        senderId: PLAYER_SENDER["player-2"],
        content: "Perfect! Thursday works great for me. Shall we work on the backhand?",
        timestamp: "2024-01-14T14:45:00",
        isRead: true,
      }),
      msg({
        id: "msg-8",
        senderId: COACH_SENDER_ID,
        content: "Of course, we’ll focus on the backhand and the bandeja. Bring extra water!",
        timestamp: "2024-01-14T15:00:00",
        isRead: true,
      }),
      msg({
        id: "msg-9",
        senderId: PLAYER_SENDER["player-2"],
        content: "Thanks for today’s lesson, I learned a lot about the backhand.",
        timestamp: "2024-01-14T20:00:00",
        isRead: true,
      }),
    ],
  },

  {
    id: "conv-3",
    participantId: "player-3",
    participantName: "Bernardo Castro",
    participantAvatar: undefined,

    lastMessage: "Understood, I’ll cancel Friday’s lesson.",
    lastMessageAt: "2024-01-13T11:30:00",

    unreadCount: 0,
    messages: [
      msg({
        id: "msg-10",
        senderId: COACH_SENDER_ID,
        content: "Hi Bernardo, just letting you know that I won’t be able to give the lesson on Friday due to a personal commitment.",
        timestamp: "2024-01-13T11:00:00",
        isRead: true,
      }),
      msg({
        id: "msg-11",
        senderId: PLAYER_SENDER["player-3"],
        content: "Understood, I’ll cancel Friday’s lesson.",
        timestamp: "2024-01-13T11:30:00",
        isRead: true,
      }),
    ],
  },

  {
    id: "conv-4",
    participantId: "player-4",
    participantName: "Dudas BF",
    participantAvatar: undefined,

    lastMessage: "Can we move Tuesday’s lesson to Wednesday?",
    lastMessageAt: "2024-01-12T16:00:00",

    unreadCount: 1,
    messages: [
      msg({
        id: "msg-12",
        senderId: PLAYER_SENDER["player-4"],
        content: "Can we move Tuesday’s lesson to Wednesday?",
        timestamp: "2024-01-12T16:00:00",
        isRead: false,
      }),
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
      msg({
        id: "msg-13",
        senderId: COACH_SENDER_ID,
        content: "Talinho, remember to bring the new outfit for the group photo.",
        timestamp: "2024-01-10T09:00:00",
        isRead: true,
      }),
      msg({
        id: "msg-14",
        senderId: PLAYER_SENDER["player-5"],
        content: "Perfect, thanks!",
        timestamp: "2024-01-10T09:15:00",
        isRead: true,
      }),
    ],
  },
];
