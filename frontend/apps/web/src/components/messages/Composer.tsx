import { useState, useRef, useEffect } from 'react';
import { Send, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { MessageTextarea } from '@/components/ui/message-textarea';
import { useLayout } from '@/components/layout/LayoutContext';
import type { Message } from '@/types';

interface Props {
  onSend: (content: string, replyToId?: string) => void;
  onEditSave: (msgId: string, content: string) => void;
  editingMessage: Message | null;
  replyingTo: Message | null;
  userId: number;
  participantName: string;
  isMobile?: boolean;
  onCancelEdit: () => void;
  onCancelReply: () => void;
  /** True when the other participant is blocked — disables sending and shows `disabledNote`. */
  disabled?: boolean;
  disabledNote?: string;
}

export function Composer({ onSend, onEditSave, editingMessage, replyingTo, userId, participantName, isMobile, onCancelEdit, onCancelReply, disabled, disabledNote }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { setBottomNavHidden } = useLayout();

  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.content ?? '');
      textareaRef.current?.focus();
    }
  }, [editingMessage]);

  const handleSend = () => {
    if (disabled) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    if (editingMessage) {
      onEditSave(String(editingMessage.id), trimmed);
    } else {
      onSend(trimmed, replyingTo ? String(replyingTo.id) : undefined);
    }
    setText('');
  };

  return (
    <div className="p-4 border-t border-border bg-card">
      {disabled && disabledNote && (
        <p
          data-testid="composer-blocked-note"
          className="mb-2 text-xs text-muted-foreground"
        >
          {disabledNote}
        </p>
      )}

      {/* Reply preview */}
      {replyingTo && !editingMessage && (
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 rounded-lg border-l-[3px] border-primary bg-muted px-2.5 py-1.5 text-left">
            <p className="text-xs font-semibold text-primary">
              {Number(replyingTo.senderId) === Number(userId) ? t('messages.you') : participantName}
            </p>
            <p className="text-xs text-muted-foreground line-clamp-1">{replyingTo.content}</p>
          </div>
          <button onClick={onCancelReply} className="p-1 rounded-full hover:bg-accent" aria-label={t("messages.cancelReply")}>
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Editing indicator */}
      {editingMessage && (
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 rounded-lg border-l-[3px] border-warning bg-warning/10 px-2.5 py-1.5">
            <p className="text-xs font-semibold text-warning-strong">{t('messages.editingMessage')}</p>
            <p className="text-xs text-muted-foreground line-clamp-1">{editingMessage.content}</p>
          </div>
          <button onClick={() => { onCancelEdit(); setText(''); }} className="p-1 rounded-full hover:bg-accent" aria-label={t("messages.cancelEdit")}>
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      )}

      <div className="max-w-3xl mx-auto flex items-end gap-2">
        <MessageTextarea
          ref={textareaRef}
          isMobile={isMobile}
          value={text}
          onValueChange={setText}
          onSend={handleSend}
          placeholder={t("messages.typePlaceholder")}
          enterBehavior={isMobile ? 'newline' : 'send'}
          onFocus={() => { if (isMobile) setBottomNavHidden(true); }}
          onBlur={() => { if (isMobile) setBottomNavHidden(false); }}
          disabled={disabled}
        />
        <Button
          onPointerDown={(e) => e.preventDefault()}
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          className="shrink-0"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
