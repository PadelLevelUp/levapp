import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ConversationList } from '@/components/messages/ConversationList';
import { ChatThread } from '@/components/messages/ChatThread';
import { mockConversations, Conversation } from '@/data/mockMessages';

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>(mockConversations);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    mockConversations[0]?.id || null
  );

  const selectedConversation = conversations.find(c => c.id === selectedConversationId);

  const handleNewConversation = (studentId: string, studentName: string) => {
    // Check if conversation already exists
    const existing = conversations.find(c => c.participantId === studentId);
    if (existing) {
      setSelectedConversationId(existing.id);
      return;
    }

    // Create new conversation
    const newConversation: Conversation = {
      id: `conv-${Date.now()}`,
      participantId: studentId,
      participantName: studentName,
      lastMessage: '',
      lastMessageTime: 'Ahora',
      unreadCount: 0,
      messages: [],
    };

    setConversations(prev => [newConversation, ...prev]);
    setSelectedConversationId(newConversation.id);
  };

  return (
    <AppLayout>
      <div className="flex h-full">
        {/* Conversation List */}
        <ConversationList
          conversations={conversations}
          selectedId={selectedConversationId}
          onSelect={setSelectedConversationId}
          onNewConversation={handleNewConversation}
        />

        {/* Chat Thread */}
        <ChatThread conversation={selectedConversation} />
      </div>
    </AppLayout>
  );
}
