import { useRef, useEffect, useLayoutEffect, useCallback, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { AT_BOTTOM_THRESHOLD_PX } from '@levelup/hooks';
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
  /** PAD-208 — true while older messages remain unfetched (rule 11). */
  hasMore?: boolean;
  /** PAD-208 — true while a page of older messages is in flight. */
  loadingOlder?: boolean;
  /** PAD-208 — asked for when the reader reaches the top of the loaded page. */
  onLoadOlder?: () => void;
}

export function MessageList({
  messages,
  userId,
  participantName,
  onReply,
  onEdit,
  onDelete,
  onReaction,
  hasMore = false,
  loadingOlder = false,
  onLoadOlder,
}: Props) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);
  const hasInitializedRef = useRef(false);
  const lastMessageIdRef = useRef<string | null>(null);
  const nearBottomRef = useRef(true);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // PAD-208 rule 11: what the scroller looked like at the previous commit —
  // refreshed on every render, so a prepend can put back exactly the height
  // that appeared above the viewport, whatever else changed alongside it (the
  // loading indicator appearing and disappearing, for one).
  const lastMetricsRef = useRef<{ firstId: string | null; scrollHeight: number; scrollTop: number } | null>(null);
  // PAD-224 rule 12: a jump-to-bottom the user asked for, still outstanding.
  const jumpRequestedRef = useRef(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  const isNearBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < AT_BOTTOM_THRESHOLD_PX;
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    // PAD-224 rule 12 — the user asked to go to the bottom, and that intent
    // outranks rule 11's prepend compensation. Reaching the top is what makes
    // an older page load, so "scroll up a long way, then tap jump-to-bottom" is
    // precisely the case where a page lands mid-jump; without this the
    // compensation puts the reader back where the prepend wanted them.
    jumpRequestedRef.current = true;
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

  const firstMessageId = messages.length ? String(messages[0].id) : null;

  /**
   * PAD-208 rules 9 and 11 — everything that moves the viewport, before paint.
   *
   * `useLayoutEffect`, not `useEffect`: the initial anchor (rule 9) and the
   * prepend compensation (rule 11) must both happen between React writing the
   * DOM and the browser painting it, or the user sees the list travel — which
   * is the whole complaint the ticket is about.
   */
  useLayoutEffect(() => {
    const el = containerRef.current;
    const last = messages[messages.length - 1];
    if (!el || !last) {
      lastMetricsRef.current = null;
      return;
    }

    const previous = lastMetricsRef.current;
    const remember = () => {
      lastMetricsRef.current = {
        firstId: firstMessageId,
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
      };
    };

    // ── An older page was just prepended (rule 11) ──
    // The first message changed but the one that used to be first is still
    // rendered, so everything new is *above* the viewport. Giving back exactly
    // the height that appeared there leaves the reader's text where it was.
    const isPrepend =
      !!previous &&
      previous.firstId !== null &&
      previous.firstId !== firstMessageId &&
      messages.some((m) => String(m.id) === previous.firstId);

    if (isPrepend && previous) {
      if (jumpRequestedRef.current) {
        // Rule 12 beats rule 11 when the reader asked for the bottom: the page
        // that just landed above them is not a reason to put them back.
        jumpRequestedRef.current = false;
        el.scrollTop = el.scrollHeight;
      } else {
        el.scrollTop = previous.scrollTop + (el.scrollHeight - previous.scrollHeight);
      }
      lastMessageIdRef.current = String(last.id);
      remember();
      return;
    }

    const currentLastId = String(last.id);

    // ── First paint of a thread (rule 9) ──
    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      lastMessageIdRef.current = currentLastId;
      // `scrollTop` rather than `scrollIntoView`: the latter can animate and
      // can scroll ancestors. This lands the newest message at the bottom
      // before the first paint, with no travel to watch.
      el.scrollTop = el.scrollHeight;
      remember();
      return;
    }

    if (lastMessageIdRef.current === currentLastId) {
      remember();
      return;
    }
    lastMessageIdRef.current = currentLastId;

    // ── Something arrived at the bottom (rule 10) ──
    const isMine = Number(last.senderId) === Number(userId);
    if (isMine || nearBottomRef.current) {
      scrollToBottom(true);
      setHasNewBelow(false);
    } else {
      // Away from the bottom the viewport does not move; the affordance is what
      // tells the reader there is something new down there.
      setHasNewBelow(true);
    }
    remember();
  });

  // NOTE: a new thread must start from a fresh anchor. ChatThread gives this
  // component `key={conversation.id}`, so switching conversations remounts it
  // and every ref above starts clean — cheaper and harder to get wrong than
  // resetting them by hand off a changed id.

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  /**
   * PAD-208 rule 11 — the top sentinel. An IntersectionObserver rather than a
   * scroll threshold so the request is made once when the top actually comes
   * into view, however the reader got there (wheel, drag, keyboard, a jump to a
   * quoted reply).
   */
  useEffect(() => {
    const sentinel = topSentinelRef.current;
    const root = containerRef.current;
    if (!sentinel || !root || !onLoadOlder || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Only once the thread has been anchored at its newest message: before
        // that the scroller is still at offset 0, and the sentinel would ask
        // for an older page the instant the conversation opens.
        if (!hasInitializedRef.current) return;
        if (!entries.some((entry) => entry.isIntersecting)) return;
        onLoadOlder();
      },
      { root, rootMargin: `${AT_BOTTOM_THRESHOLD_PX}px 0px 0px 0px` }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, onLoadOlder]);

  const handleScroll = () => {
    const nearBottom = isNearBottom();
    nearBottomRef.current = nearBottom;
    setShowScrollDown(!nearBottom);
    if (nearBottom) {
      setHasNewBelow(false);
      // The jump landed; a later prepend is an ordinary prepend again.
      jumpRequestedRef.current = false;
    }
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
        data-testid="message-scroller"
        onScroll={handleScroll}
        className="absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain px-1 py-3"
      >
        {/* PAD-208 rule 11 — reaching this asks for the page before the oldest
            loaded message. It sits above the first bubble, so it only comes
            into view when the reader is genuinely at the top. */}
        <div ref={topSentinelRef} aria-hidden="true" className="h-px" />

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

      {/* PAD-208 rule 11 — the loading indicator is an OVERLAY, not a row in
          the scroller. Inside the scrolling content it would add its own height
          above the viewport when it appears and take it away again when the
          page lands, and the reader would see the thread shift by exactly that
          much (~40px) either side of the prepend. Out here it changes no
          scroll geometry at all, so the only height change above the viewport
          is the prepended page — which the layout effect compensates exactly. */}
      {loadingOlder && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none"
          role="status"
          aria-live="polite"
        >
          <span className="px-3 py-1 rounded-full bg-card/90 backdrop-blur-sm text-xs text-muted-foreground shadow-sm">
            {t('messages.loadingOlder')}
          </span>
        </div>
      )}

      {showScrollDown && (
        <button
          onClick={() => {
            scrollToBottom();
            setHasNewBelow(false);
          }}
          className={
            hasNewBelow
              ? "absolute bottom-4 right-4 h-10 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center gap-1 px-3 hover:bg-primary/90 transition-colors animate-fade-in"
              : "absolute bottom-4 right-4 w-10 h-10 rounded-full bg-card shadow-lg border border-border flex items-center justify-center hover:bg-accent transition-colors animate-fade-in"
          }
          aria-label={hasNewBelow ? t("messages.newMessagesBelow") : t("messages.scrollToBottom")}
        >
          {hasNewBelow && (
            <span className="text-xs font-medium">{t("messages.newMessagesBelow")}</span>
          )}
          <ChevronDown className={hasNewBelow ? "h-4 w-4" : "h-5 w-5 text-muted-foreground"} />
        </button>
      )}
    </div>
  );
}
