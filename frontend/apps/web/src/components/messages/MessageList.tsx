import { useRef, useEffect, useCallback, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { Message } from '@/types';
import { MessageBubble } from './MessageBubble';

function formatDateSeparator(iso: string, t: TFunction): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return t('messages.today');
  if (date.toDateString() === yesterday.toDateString()) return t('messages.yesterday');
  return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

interface Props {
  messages: Message[];
  userId: number;
  participantName: string;
  onReply: (msg: Message) => void;
  onEdit: (msg: Message) => void;
  onDelete: (msgId: string) => void;
  onReaction: (msgId: string, emoji: string) => void;
}

export function MessageList({ messages, userId, participantName, onReply, onEdit, onDelete, onReaction }: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasInitializedRef = useRef(false);
  const lastMessageIdRef = useRef<string | null>(null);
  const nearBottomRef = useRef(true);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  const isNearBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  const scrollToMessage = useCallback((msgId: string) => {
    const el = containerRef.current?.querySelector(`[data-msg-id="${msgId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMessageId(msgId);
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
      highlightTimerRef.current = setTimeout(() => setHighlightedMessageId(null), 900);
    }
  }, []);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (!last) return;

    const currentLastId = String(last.id);
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      lastMessageIdRef.current = currentLastId;
      scrollToBottom(false);
      return;
    }

    if (lastMessageIdRef.current === currentLastId) return;
    lastMessageIdRef.current = currentLastId;

    const isMine = Number(last.senderId) === Number(userId);
    if (isMine || nearBottomRef.current) {
      scrollToBottom(true);
    }
  }, [messages, scrollToBottom, userId]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  const handleScroll = () => {
    const nearBottom = isNearBottom();
    nearBottomRef.current = nearBottom;
    setShowScrollDown(!nearBottom);
  };

  // Group messages by date
  const grouped: { date: string; messages: Message[] }[] = [];
  messages.forEach(msg => {
    const dateStr = formatDateSeparator(msg.timestamp, t);
    const last = grouped[grouped.length - 1];
    if (last && last.date === dateStr) {
      last.messages.push(msg);
    } else {
      grouped.push({ date: dateStr, messages: [msg] });
    }
  });

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center px-8">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">💬</span>
          </div>
          <p className="text-muted-foreground text-sm">{t("messages.noMessagesYet")}</p>
          <p className="text-muted-foreground/60 text-xs mt-1">{t("messages.startConversation")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative overflow-hidden bg-background">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain px-1 py-3"
      >
        {grouped.map(group => (
          <div key={group.date}>
            <div className="flex justify-center my-3">
              <span className="px-3 py-1 rounded-full bg-card/80 backdrop-blur-sm text-xs text-muted-foreground shadow-sm">
                {group.date}
              </span>
            </div>
            {group.messages.map((msg, i) => {
              const prev = group.messages[i - 1];
              const showTail = !prev || prev.senderId !== msg.senderId;
              const isMine = msg.senderId === userId;
              const replyMsg = msg.replyTo != null
                ? messages.find(m => String(m.id) === String(msg.replyTo))
                : undefined;

              return (
                <div key={msg.id} data-msg-id={String(msg.id)} className="rounded-lg">
                  <MessageBubble
                    message={msg}
                    isMine={isMine}
                    userId={userId}
                    participantName={participantName}
                    isHighlighted={highlightedMessageId === String(msg.id)}
                    showTail={showTail}
                    replyToMessage={replyMsg}
                    onReply={onReply}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onReaction={onReaction}
                    onScrollToMessage={scrollToMessage}
                  />
                </div>
              );
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {showScrollDown && (
        <button
          onClick={() => scrollToBottom()}
          className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-card shadow-lg border border-border flex items-center justify-center hover:bg-accent transition-colors animate-fade-in"
          aria-label={t("messages.scrollToBottom")}
        >
          <ChevronDown className="h-5 w-5 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}
