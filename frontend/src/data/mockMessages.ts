export interface Message {
  id: string;
  senderId: string;
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

const COACH_ID = 'coach-1';

export const mockConversations: Conversation[] = [
  {
    id: 'conv-1',
    participantId: 'student-1',
    participantName: 'Carlos García',
    lastMessage: 'Perfecto, nos vemos mañana entonces!',
    lastMessageTime: '10:30',
    unreadCount: 2,
    messages: [
      {
        id: 'msg-1',
        senderId: COACH_ID,
        content: 'Hola Carlos, ¿cómo estás? Te escribo para confirmar la clase de mañana.',
        timestamp: '2024-01-15T09:00:00',
        isRead: true,
      },
      {
        id: 'msg-2',
        senderId: 'student-1',
        content: 'Hola! Sí, todo confirmado. ¿A las 18:00 como siempre?',
        timestamp: '2024-01-15T09:15:00',
        isRead: true,
      },
      {
        id: 'msg-3',
        senderId: COACH_ID,
        content: 'Exacto, 18:00 en la pista 3. Trae la pala nueva si quieres probarla.',
        timestamp: '2024-01-15T09:20:00',
        isRead: true,
      },
      {
        id: 'msg-4',
        senderId: 'student-1',
        content: 'Perfecto, nos vemos mañana entonces!',
        timestamp: '2024-01-15T10:30:00',
        isRead: false,
      },
    ],
  },
  {
    id: 'conv-2',
    participantId: 'student-2',
    participantName: 'Ana Martínez',
    lastMessage: 'Gracias por la clase de hoy, aprendí mucho sobre el revés.',
    lastMessageTime: 'Ayer',
    unreadCount: 0,
    messages: [
      {
        id: 'msg-5',
        senderId: 'student-2',
        content: '¡Hola coach! Quería preguntarte si hay disponibilidad para una clase extra esta semana.',
        timestamp: '2024-01-14T14:00:00',
        isRead: true,
      },
      {
        id: 'msg-6',
        senderId: COACH_ID,
        content: 'Hola Ana! Déjame revisar mi agenda. Tengo un hueco el jueves a las 17:00, ¿te viene bien?',
        timestamp: '2024-01-14T14:30:00',
        isRead: true,
      },
      {
        id: 'msg-7',
        senderId: 'student-2',
        content: 'Perfecto! El jueves me va genial. ¿Trabajamos el revés?',
        timestamp: '2024-01-14T14:45:00',
        isRead: true,
      },
      {
        id: 'msg-8',
        senderId: COACH_ID,
        content: 'Claro, nos enfocamos en el revés y la bandeja. Trae agua extra!',
        timestamp: '2024-01-14T15:00:00',
        isRead: true,
      },
      {
        id: 'msg-9',
        senderId: 'student-2',
        content: 'Gracias por la clase de hoy, aprendí mucho sobre el revés.',
        timestamp: '2024-01-14T20:00:00',
        isRead: true,
      },
    ],
  },
  {
    id: 'conv-3',
    participantId: 'student-3',
    participantName: 'Miguel López',
    lastMessage: 'Entendido, cancelo la clase del viernes.',
    lastMessageTime: 'Lun',
    unreadCount: 0,
    messages: [
      {
        id: 'msg-10',
        senderId: COACH_ID,
        content: 'Hola Miguel, te aviso que el viernes no podré dar clase por un compromiso personal.',
        timestamp: '2024-01-13T11:00:00',
        isRead: true,
      },
      {
        id: 'msg-11',
        senderId: 'student-3',
        content: 'Entendido, cancelo la clase del viernes.',
        timestamp: '2024-01-13T11:30:00',
        isRead: true,
      },
    ],
  },
  {
    id: 'conv-4',
    participantId: 'student-4',
    participantName: 'Laura Fernández',
    lastMessage: '¿Podemos cambiar la clase del martes al miércoles?',
    lastMessageTime: '12 Ene',
    unreadCount: 1,
    messages: [
      {
        id: 'msg-12',
        senderId: 'student-4',
        content: '¿Podemos cambiar la clase del martes al miércoles?',
        timestamp: '2024-01-12T16:00:00',
        isRead: false,
      },
    ],
  },
  {
    id: 'conv-5',
    participantId: 'student-5',
    participantName: 'Pedro Sánchez',
    lastMessage: 'Perfecto, gracias!',
    lastMessageTime: '10 Ene',
    unreadCount: 0,
    messages: [
      {
        id: 'msg-13',
        senderId: COACH_ID,
        content: 'Pedro, recuerda traer la equipación nueva para la foto del grupo.',
        timestamp: '2024-01-10T09:00:00',
        isRead: true,
      },
      {
        id: 'msg-14',
        senderId: 'student-5',
        content: 'Perfecto, gracias!',
        timestamp: '2024-01-10T09:15:00',
        isRead: true,
      },
    ],
  },
];
