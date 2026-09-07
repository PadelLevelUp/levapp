import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Conversation, Message } from '@/types';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { ReportMessageDialog } from './ReportMessageDialog';
import { blockUser, unblockUser, getBlockedUsers } from '@/api/messages';

interface ChatThreadProps {
  conversation: Conversation;
  user_id: number;
  onSendMessage: (content: string, replyToId?: string) => Promise<void>;
  onEditMessage: (messageId: string, content: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onBack?: () => void;
  isMobile?: boolean;
  /** PAD-208 — older messages remain unfetched (messaging.conversation-detail rule 11). */
  hasMore?: boolean;
  /** PAD-208 — a page of older messages is in flight. */
  loadingOlder?: boolean;
  /** PAD-208 — the reader reached the top of the loaded page. */
  onLoadOlder?: () => void;
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
  hasMore,
  loadingOlder,
  onLoadOlder,
}: ChatThreadProps) {
  const { t } = useTranslation();
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string>>(new Set());
  const [reportOpen, setReportOpen] = useState(false);

  const participantId = conversation.participantId;
  const isBlocked = blockedUserIds.has(String(participantId));

  // PAD-203: null when the counterpart is gone (messaging.conversations
  // rule 10). Resolved once here so every child gets a real string.
  const participantName =
    conversation.participantName ?? t('messages.deletedUser');

  useEffect(() => {
    let cancelled = false;
    getBlockedUsers()
      .then((list) => {
        if (!cancelled) setBlockedUserIds(new Set(list.map((u) => String(u.id))));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Re-check whenever the open conversation's participant changes.
  }, [participantId]);

  const lastParticipantMessageId = useMemo(() => {
    const messages = conversation.messages ?? [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (Number(messages[i].senderId) !== Number(user_id)) {
        return String(messages[i].id);
      }
    }
    return null;
  }, [conversation.messages, user_id]);

  const handleConfirmToggleBlock = async () => {
    try {
      if (isBlocked) {
        await unblockUser(String(participantId));
        setBlockedUserIds((prev) => {
          const next = new Set(prev);
          next.delete(String(participantId));
          return next;
        });
        toast.success(t('messages.unblockSuccess'));
      } else {
        await blockUser(String(participantId));
        setBlockedUserIds((prev) => new Set(prev).add(String(participantId)));
        toast.success(t('messages.blockSuccess'));
      }
    } catch {
      toast.error(t(isBlocked ? 'messages.unblockFailed' : 'messages.blockFailed'));
    }
  };

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
        isBlocked={isBlocked}
        onConfirmToggleBlock={handleConfirmToggleBlock}
        onReport={() => setReportOpen(true)}
      />

      {/* `key`: MessageList holds the scroll anchor for one thread in refs
          (PAD-208 rules 9 and 11). Switching conversations must start those
          over, and remounting is how that is guaranteed. */}
      <MessageList
        key={String(conversation.id)}
        messages={conversation.messages ?? []}
        userId={user_id}
        participantName={participantName}
        onReply={handleReply}
        onEdit={handleEdit}
        onDelete={onDeleteMessage}
        onReaction={onToggleReaction}
        hasMore={hasMore}
        loadingOlder={loadingOlder}
        onLoadOlder={onLoadOlder}
      />

      {/* Assistant conversations are a one-way channel — no composer */}
      {!conversation.isAssistant && (
        <Composer
          onSend={handleSend}
          onEditSave={handleEditSave}
          editingMessage={editingMessage}
          replyingTo={replyingTo}
          userId={user_id}
          participantName={participantName}
          isMobile={isMobile}
          onCancelEdit={() => setEditingMessage(null)}
          onCancelReply={() => setReplyingTo(null)}
          disabled={isBlocked}
          disabledNote={t('messages.blockedComposerNote')}
        />
      )}

      <ReportMessageDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        messageId={lastParticipantMessageId}
      />
    </div>
  );
}
