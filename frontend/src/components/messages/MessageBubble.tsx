import { useState, useRef } from 'react';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { Check, CheckCheck, Clock, AlertCircle, Reply } from 'lucide-react';
import type { Message, MessageStatus } from '@/types';
import { MessageActionMenu } from './MessageActionMenu';
import { respondToNotification } from '@/api/notificationEngine';
import { toast } from 'sonner';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface Props {
  message: Message;
  isMine: boolean;
  userId: number;
  participantName: string;
  isHighlighted?: boolean;
  showTail?: boolean;
  replyToMessage?: Message;
  onReply: (msg: Message) => void;
  onEdit: (msg: Message) => void;
  onDelete: (msgId: string) => void;
  onReaction: (msgId: string, emoji: string) => void;
  onScrollToMessage?: (msgId: string) => void;
}

function StatusIcon({ status }: { status: MessageStatus }) {
  switch (status) {
    case 'sending':   return <Clock       className="h-3 w-3 text-primary-foreground/50" />;
    case 'sent':      return <Check       className="h-3 w-3 text-primary-foreground/60" />;
    case 'delivered': return <CheckCheck  className="h-3 w-3 text-primary-foreground/60" />;
    case 'read':      return <CheckCheck  className="h-3 w-3 text-blue-300" />;
    case 'failed':    return <AlertCircle className="h-3 w-3 text-destructive" />;
    default:          return null;
  }
}

export function MessageBubble({
  message, isMine, userId, participantName, isHighlighted, showTail, replyToMessage,
  onReply, onEdit, onDelete, onReaction, onScrollToMessage,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [responding, setResponding] = useState(false);

  const isInvite = message.messageType === "notification_invite";
  const canRespond = isInvite && !isMine && !message.metadata?.responded;

  const handleRespond = async (action: "yes" | "no") => {
    const eventId = message.metadata?.notificationEventId;
    if (!eventId || responding) return;
    setResponding(true);
    try {
      const result = await respondToNotification(eventId, action);
      if (result.action === "spot_filled") {
        toast.info("Sorry, that spot was just filled.");
      } else if (result.action === "confirmed") {
        toast.success("You're in! See you there.");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setResponding(false);
    }
  };
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();
  const x = useMotionValue(0);
  const replyOpacity = useTransform(x, [40, 80], [0, 1]);
  const hasSwipedRef = useRef(false);

  const handlePanEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x > 60 && !hasSwipedRef.current) {
      hasSwipedRef.current = true;
      onReply(message);
      setTimeout(() => { hasSwipedRef.current = false; }, 300);
    }
  };

  const openMenuAt = (clientX: number, clientY: number) => {
    setMenuPosition({ x: clientX, y: clientY });
    setMenuOpen(true);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const tx = touch.clientX;
    const ty = touch.clientY;
    longPressTimer.current = setTimeout(() => openMenuAt(tx, ty), 500);
  };
  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  if (message.isDeleted) {
    return (
      <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} px-3 ${showTail ? 'mt-2.5' : 'mt-1.5'}`}>
        <div className={`rounded-2xl px-3.5 py-2 italic text-sm text-muted-foreground bg-muted ${
          isMine ? (showTail ? 'rounded-br-md' : '') : (showTail ? 'rounded-bl-md' : '')
        }`}>
          Message deleted
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} px-3 ${showTail ? 'mt-2.5' : 'mt-1.5'}`}>
      <motion.div
        className={`relative max-w-[80%] md:max-w-[65%] ${message.reactions?.length ? 'pb-4' : ''}`}
        drag="x"
        dragConstraints={{ left: 0, right: 80 }}
        dragElastic={0.1}
        onDragEnd={handlePanEnd}
        style={{ x }}
        whileDrag={{ cursor: 'grabbing' }}
        dragSnapToOrigin
      >
        {/* Reply indicator on swipe */}
        <motion.div
          className="absolute left-full top-1/2 -translate-y-1/2 ml-2"
          style={{ opacity: replyOpacity }}
        >
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Reply className="h-4 w-4 text-primary" />
          </div>
        </motion.div>

        <div
          onContextMenu={e => { e.preventDefault(); openMenuAt(e.clientX, e.clientY); }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onTouchMove={handleTouchEnd}
          className={`relative rounded-2xl px-3.5 py-2 animate-message-in transition-all duration-200 ${
            menuOpen ? 'ring-2 ring-primary/40 scale-[1.02]' : ''
          } ${
            isHighlighted ? 'brightness-95' : ''
          } ${
            isMine
              ? `bg-primary text-primary-foreground ${showTail ? 'rounded-br-md' : ''}`
              : `bg-muted shadow-sm ${showTail ? 'rounded-bl-md' : ''}`
          }`}
        >
          {/* Reply preview */}
          {replyToMessage && (
            <button
              onClick={() => onScrollToMessage?.(String(replyToMessage.id))}
              className={`block w-full text-right mb-1.5 pr-2.5 pl-1.5 pt-0.5 border-r-2 rounded-sm text-xs ${
                isMine
                  ? 'border-primary-foreground/40 text-primary-foreground/80 bg-primary-foreground/10'
                  : 'border-primary text-muted-foreground bg-foreground/5'
              }`}
            >
              <span className="font-semibold block">
                {Number(replyToMessage.senderId) === Number(userId) ? 'You' : participantName}
              </span>
              <span className="line-clamp-1">{replyToMessage.content}</span>
            </button>
          )}

          <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
            {message.content}
          </p>

          <div className={`flex items-center gap-1 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
            {message.edited && (
              <span className={`text-[10px] ${isMine ? 'text-primary-foreground/50' : 'text-muted-foreground'}`}>
                edited
              </span>
            )}
            <span className={`text-[10px] ${isMine ? 'text-primary-foreground/50' : 'text-muted-foreground'}`}>
              {formatTime(message.timestamp)}
            </span>
            {isMine && message.status && <StatusIcon status={message.status} />}
          </div>
        </div>

        {/* Notification invite Yes/No buttons */}
        {canRespond && (
          <div className="flex gap-2 mt-1.5 ml-1">
            <button
              onClick={() => handleRespond("yes")}
              disabled={responding}
              className="flex-1 py-1.5 text-sm font-medium rounded-xl bg-primary text-primary-foreground disabled:opacity-50 transition-opacity"
            >
              {responding ? "…" : "Yes"}
            </button>
            <button
              onClick={() => handleRespond("no")}
              disabled={responding}
              className="flex-1 py-1.5 text-sm font-medium rounded-xl bg-muted text-foreground disabled:opacity-50 transition-opacity"
            >
              No
            </button>
          </div>
        )}

        {/* Reactions */}
        {message.reactions && message.reactions.length > 0 && (
          <div className={`absolute bottom-0 z-10 flex flex-wrap gap-1 ${isMine ? 'right-2 justify-end' : 'left-2 justify-start'}`}>
            {Array.from(new Set(message.reactions.map(r => r.emoji))).map(emoji => {
              const count = message.reactions!.filter(r => r.emoji === emoji).length;
              return (
                <button
                  key={emoji}
                  onClick={() => onReaction(String(message.id), emoji)}
                  className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-card border border-border shadow-sm text-xs hover:bg-accent transition-colors"
                >
                  <span>{emoji}</span>
                  {count > 1 && <span className="text-muted-foreground">{count}</span>}
                </button>
              );
            })}
          </div>
        )}

        {menuOpen && (
          <MessageActionMenu
            isMine={isMine}
            position={menuPosition}
            onClose={() => setMenuOpen(false)}
            onReply={() => { setMenuOpen(false); onReply(message); }}
            onEdit={isMine ? () => { setMenuOpen(false); onEdit(message); } : undefined}
            onDelete={isMine ? () => { setMenuOpen(false); onDelete(String(message.id)); } : undefined}
            onCopy={() => { navigator.clipboard.writeText(message.content ?? ''); setMenuOpen(false); }}
            onReaction={(emoji) => { onReaction(String(message.id), emoji); setMenuOpen(false); }}
          />
        )}
      </motion.div>
    </div>
  );
}
