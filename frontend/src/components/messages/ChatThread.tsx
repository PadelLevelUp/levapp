import { useState } from 'react';
import type { Conversation, Message } from '@/types';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { Composer } from './Composer';

interface ChatThreadProps {
  conversation: Conversation;
  user_id: number;
  onSendMessage: (content: string, replyToId?: string) => Promise<void>;
  onEditMessage: (messageId: string, content: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onBack?: () => void;
  isMobile?: boolean;
}

export function ChatThread({
  conversation,
  user_id,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onToggleReaction,
  onBack,
  isMobile,
}: ChatThreadProps) {
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  const handleSend = (content: string, replyToId?: string) => {
    void onSendMessage(content, replyToId);
    setReplyingTo(null);
  };

  const handleEditSave = async (msgId: string, content: string) => {
    await onEditMessage(msgId, content);
    setEditingMessage(null);
  };

  const handleReply = (msg: Message) => {
    setEditingMessage(null);
    setReplyingTo(msg);
  };

  const handleEdit = (msg: Message) => {
    setReplyingTo(null);
    setEditingMessage(msg);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <ChatHeader
        conversation={conversation}
        onBack={onBack}
        showBack={isMobile && !!onBack}
      />

      <MessageList
        messages={conversation.messages ?? []}
        userId={user_id}
        participantName={conversation.participantName}
        onReply={handleReply}
        onEdit={handleEdit}
        onDelete={onDeleteMessage}
        onReaction={onToggleReaction}
      />

      {/* Assistant conversations are a one-way channel — no composer */}
      {!conversation.isAssistant && (
        <Composer
          onSend={handleSend}
          onEditSave={handleEditSave}
          editingMessage={editingMessage}
          replyingTo={replyingTo}
          userId={user_id}
          participantName={conversation.participantName}
          isMobile={isMobile}
          onCancelEdit={() => setEditingMessage(null)}
          onCancelReply={() => setReplyingTo(null)}
        />
      )}
    </div>
  );
}
