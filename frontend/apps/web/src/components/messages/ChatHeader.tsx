import { useState } from 'react';
import { ArrowLeft, MoreVertical, Ban, Flag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Conversation } from '@/types';

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function getRoleLabel(conversation: Conversation, t: TFunction): string {
  if (conversation.isAssistant) return t('messages.roleAssistant');
  const role = conversation.participantRole;
  if (!role) return '';
  if (role.toLowerCase() === 'coach') return t('messages.roleCoach');
  if (role.toLowerCase() === 'player') return t('messages.rolePlayer');
  return role.charAt(0).toUpperCase() + role.slice(1);
}

interface Props {
  conversation: Conversation;
  onBack?: () => void;
  showBack?: boolean;
  /** Whether `conversation.participantId` is currently blocked. */
  isBlocked: boolean;
  /** Called after the user confirms the block/unblock action in the dialog. */
  onConfirmToggleBlock: () => void | Promise<void>;
  /** Opens the report dialog for the most recent message from this participant. */
  onReport: () => void;
}

export function ChatHeader({ conversation, onBack, showBack, isBlocked, onConfirmToggleBlock, onReport }: Props) {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Assistant conversations aren't a real user — nothing to block/report.
  const showModeration = !conversation.isAssistant;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirmToggleBlock();
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-card border-b border-border min-h-[56px]">
      {showBack && (
        <button
          onClick={onBack}
          className="p-1.5 -ml-1 rounded-full hover:bg-accent transition-colors"
          aria-label={t("messages.back")}
        >
          <ArrowLeft className="h-5 w-5 text-primary" />
        </button>
      )}

      <Avatar className="w-9 h-9 flex-shrink-0">
        <AvatarImage src={conversation.participantAvatar} />
        <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
          {getInitials(conversation.participantName)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <h2 className="text-sm font-semibold text-foreground truncate">{conversation.participantName}</h2>
        {getRoleLabel(conversation, t) && (
          <p className="text-xs text-muted-foreground">{getRoleLabel(conversation, t)}</p>
        )}
      </div>

      {showModeration && (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                data-testid="chat-more-options"
                aria-label={t('messages.moreOptions')}
              >
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                data-testid={isBlocked ? 'chat-unblock-user' : 'chat-block-user'}
                onClick={() => setConfirmOpen(true)}
              >
                <Ban className="w-4 h-4 mr-2" />
                {isBlocked ? t('messages.unblockUser') : t('messages.blockUser')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onReport}>
                <Flag className="w-4 h-4 mr-2" />
                {t('messages.report.action')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <AlertDialog open={confirmOpen} onOpenChange={(o) => !submitting && setConfirmOpen(o)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {isBlocked ? t('messages.unblockDialogTitle') : t('messages.blockDialogTitle')}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {isBlocked ? t('messages.unblockDialogDescription') : t('messages.blockDialogDescription')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={submitting}>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  className={isBlocked ? undefined : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}
                  disabled={submitting}
                  onClick={(e) => {
                    e.preventDefault();
                    void handleConfirm();
                  }}
                >
                  {isBlocked ? t('messages.unblockConfirm') : t('messages.blockConfirm')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
