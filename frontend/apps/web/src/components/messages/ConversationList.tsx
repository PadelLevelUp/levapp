import { Search, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { formatConversationTimestamp } from '@/lib/conversationTime';
import type { Conversation } from '@/types';
import { useEffect, useRef, useState } from 'react';
import { NewConversationDialog } from './NewConversationDialog';

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
  onNewConversation: (userId: string) => void;
  /** messaging.direct-by-username — students only; rejects with the API error. */
  onNewConversationByUsername?: (username: string) => Promise<void>;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}

export function ConversationList({ conversations, selectedId, onSelect, onNewConversation, onNewConversationByUsername, onLoadMore, hasMore, loadingMore }: ConversationListProps) {
  const { t, i18n } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const sentinelRef = useRef<HTMLDivElement>(null);

  // PAD-203: `participantName` is null when the counterpart is gone
  // (messaging.conversations rule 10). The server sends no display string — it
  // has no i18n — so the label is resolved here.
  const displayName = (conv: Conversation) =>
    conv.participantName ?? t('messages.deletedUser');

  const filteredConversations = conversations.filter(conv =>
    displayName(conv).toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    if (!sentinelRef.current || !onLoadMore) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) onLoadMore(); },
      { threshold: 0.1 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatTime = (iso: string | null) =>
    formatConversationTimestamp(iso, {
      language: i18n.language,
      yesterdayLabel: t("messages.yesterday"),
    });

  const existingParticipantIds = conversations.map(c => c.participantId);

  return (
    <div className="flex flex-col h-full w-full md:w-80 border-border">
      {/* Search Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("messages.searchConversationPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <NewConversationDialog
          existingParticipantIds={existingParticipantIds}
          onSelectUser={onNewConversation}
          onStartByUsername={onNewConversationByUsername}
        />
        </div>
      </div>

      {/* Conversation List */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="divide-y divide-border">
          {filteredConversations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {t("messages.noConversationsFound")}
            </div>
          ) : (
            filteredConversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => onSelect(conversation.id)}
                className={cn(
                  "w-full flex items-start gap-3 p-3 transition-colors text-left",
                  // bg-secondary alone measured 1.03:1 against the list panel
                  // — a hue shift with no luminance step, so selection barely
                  // read. The 3px rule gives it an edge that does not depend
                  // on the fill being distinguishable.
                  selectedId === conversation.id
                    ? "bg-secondary border-l-[3px] border-primary pl-[9px]"
                    : "hover:bg-muted/50 border-l-[3px] border-transparent pl-[9px]"
                )}
              >
                <Avatar className="w-10 h-10 shrink-0">
                  <AvatarImage src={conversation.participantAvatar} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
                    {getInitials(displayName(conversation))}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "font-medium text-sm truncate",
                        conversation.unreadCount > 0 && "text-foreground"
                      )}
                    >
                      {displayName(conversation)}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatTime(conversation.lastMessageAt)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <p className="text-sm text-muted-foreground leading-snug overflow-hidden break-words [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                      {conversation.lastMessage}
                    </p>
                    {conversation.unreadCount > 0 && (
                      <span className="shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-medium">
                        {conversation.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
          {hasMore && <div ref={sentinelRef} className="h-1" />}
          {loadingMore && (
            <div className="flex justify-center py-3">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
