import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ConversationList } from '@/components/messages/ConversationList';
import { ChatThread } from '@/components/messages/ChatThread';
import { mockConversations } from '@/data/mockMessages';

export default function MessagesPage() {
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    mockConversations[0]?.id || null
  );

  const selectedConversation = mockConversations.find(c => c.id === selectedConversationId);

  return (
    <AppLayout>
      <div className="flex h-full">
        {/* Conversation List */}
        <ConversationList
          conversations={mockConversations}
          selectedId={selectedConversationId}
          onSelect={setSelectedConversationId}
        />

        {/* Chat Thread */}
        <ChatThread conversation={selectedConversation} />
      </div>
    </AppLayout>
  );
}
