import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { reportMessage } from '@/api/messages';

const REPORT_REASONS = ['unsolicited', 'spam', 'harassment', 'inappropriate', 'other'] as const;
type ReportReason = (typeof REPORT_REASONS)[number];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageId: string | null;
  /** Reason pre-selected when the dialog opens (the unknown-sender banner presets `unsolicited`). */
  presetReason?: ReportReason;
  /**
   * When given, the dialog also offers "Report and block": it files the report
   * and then calls this to block the sender (messaging.block-and-report rule 9).
   */
  onReportAndBlock?: () => Promise<void> | void;
}

export type { ReportReason };

/**
 * Report dialog reused by both the message-level action menu (report a
 * specific message) and the chat header's "Report" entry (reports the most
 * recent message from the other participant, passed in as `messageId`).
 */
export function ReportMessageDialog({
  open,
  onOpenChange,
  messageId,
  presetReason = 'spam',
  onReportAndBlock,
}: Props) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<ReportReason>(presetReason);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Re-apply the preset every time the dialog opens: the same instance serves
  // the header's Report (spam) and the banner's Report (unsolicited).
  useEffect(() => {
    if (open) setReason(presetReason);
  }, [open, presetReason]);

  const resetAndClose = () => {
    setReason(presetReason);
    setDetails('');
    onOpenChange(false);
  };

  const submitReport = async () => {
    if (!messageId) return false;
    const label = t(`messages.report.reasons.${reason}`);
    const combinedReason = details.trim() ? `${label}: ${details.trim()}` : label;
    await reportMessage(messageId, combinedReason);
    return true;
  };

  const handleSubmit = async () => {
    if (!messageId || submitting) return;
    setSubmitting(true);
    try {
      await submitReport();
      toast.success(t('messages.report.success'));
      resetAndClose();
    } catch {
      toast.error(t('messages.report.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReportAndBlock = async () => {
    if (!messageId || submitting || !onReportAndBlock) return;
    setSubmitting(true);
    try {
      await submitReport();
    } catch {
      toast.error(t('messages.report.failed'));
      setSubmitting(false);
      return;
    }
    try {
      await onReportAndBlock();
      toast.success(t('messages.report.reportAndBlockSuccess'));
      resetAndClose();
    } catch {
      // The report went through; only the block failed — say so.
      toast.error(t('messages.blockFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && (next ? onOpenChange(next) : resetAndClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('messages.report.dialogTitle')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup value={reason} onValueChange={(v) => setReason(v as ReportReason)}>
            {REPORT_REASONS.map((r) => (
              <div key={r} className="flex items-center gap-2">
                <RadioGroupItem value={r} id={`report-reason-${r}`} />
                <Label htmlFor={`report-reason-${r}`} className="font-normal">
                  {t(`messages.report.reasons.${r}`)}
                </Label>
              </div>
            ))}
          </RadioGroup>

          <Textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder={t('messages.report.detailsPlaceholder')}
            className="min-h-20"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={resetAndClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          {onReportAndBlock && (
            <Button
              variant="destructive"
              data-testid="report-and-block"
              onClick={() => void handleReportAndBlock()}
              disabled={submitting || !messageId}
            >
              {t('messages.report.reportAndBlock')}
            </Button>
          )}
          <Button
            data-testid="message-report-submit"
            onClick={() => void handleSubmit()}
            disabled={submitting || !messageId}
          >
            {submitting ? t('messages.report.submitting') : t('messages.report.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
