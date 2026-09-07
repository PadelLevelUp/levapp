import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

interface Props {
  participantName: string;
  /** Runs after the user confirms the block dialog. */
  onBlock: () => Promise<void> | void;
  /** Opens the report dialog pre-targeted at the sender's latest message. */
  onReport: () => void;
}

/**
 * messaging.block-and-report rule 8 (PAD-215): shown above the thread while
 * `isKnownContact` is false — the other participant is not one of the viewer's
 * coaches, shares no club with them, and the viewer has never written here.
 * Block reuses the header's confirm-then-toast flow; Report opens the shared
 * dialog with the `unsolicited` preset and a "Report and block" action.
 */
export function UnknownSenderBanner({ participantName, onBlock, onReport }: Props) {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [blocking, setBlocking] = useState(false);

  const handleConfirm = async () => {
    setBlocking(true);
    try {
      await onBlock();
      setConfirmOpen(false);
    } finally {
      setBlocking(false);
    }
  };

  return (
    <div
      data-testid="unknown-sender-banner"
      role="status"
      className="mx-3 mt-3 flex flex-col gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-950/30 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-2">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <p className="font-medium">
            {t('messages.unknownSender.title', { name: participantName })}
          </p>
          <p className="text-muted-foreground">{t('messages.unknownSender.description')}</p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          size="sm"
          variant="outline"
          data-testid="unknown-sender-report"
          onClick={onReport}
        >
          {t('messages.unknownSender.report')}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          data-testid="unknown-sender-block"
          onClick={() => setConfirmOpen(true)}
        >
          {t('messages.unknownSender.block')}
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !blocking && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('messages.blockDialogTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('messages.blockDialogDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={blocking}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="unknown-sender-block-confirm"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={blocking}
              onClick={(e) => {
                e.preventDefault();
                void handleConfirm();
              }}
            >
              {t('messages.blockConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
