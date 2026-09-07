import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { messagesApi } from "@levelup/api";
import { cn } from "@/lib/utils";

const REPORT_REASONS = ["unsolicited", "spam", "harassment", "inappropriate", "other"] as const;
type ReportReason = (typeof REPORT_REASONS)[number];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messageId: string | number | null;
  /** Reason pre-selected when the dialog opens (the unknown-sender banner presets `unsolicited`). */
  presetReason?: ReportReason;
  /**
   * When given, the dialog also offers "Report and block": files the report,
   * then calls this to block the sender (messaging.block-and-report rule 9).
   */
  onReportAndBlock?: () => Promise<void> | void;
};

export type { ReportReason };

/**
 * Report dialog shared by the message long-press context menu (report a
 * specific message) and the chat header's "Report" action (reports the most
 * recent message from the other participant). No radio-group primitive is
 * installed on mobile, so the preset reasons are a plain Pressable list with
 * a manually drawn radio dot — mirrors the pattern in message-context-menu.tsx.
 */
export function ReportMessageDialog({
  open,
  onOpenChange,
  messageId,
  presetReason = "spam",
  onReportAndBlock,
}: Props) {
  const { t } = useTranslation();
  const [reason, setReason] = React.useState<ReportReason>(presetReason);
  const [details, setDetails] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  // Re-apply the preset on every open: one instance serves the header's
  // Report (spam) and the unknown-sender banner's Report (unsolicited).
  React.useEffect(() => {
    if (open) setReason(presetReason);
  }, [open, presetReason]);

  const resetAndClose = () => {
    setReason(presetReason);
    setDetails("");
    onOpenChange(false);
  };

  const submitReport = async () => {
    const label = t(`messages.report.reasons.${reason}`);
    const combinedReason = details.trim()
      ? `${label}: ${details.trim()}`
      : label;
    await messagesApi.reportMessage(String(messageId), combinedReason);
  };

  const handleSubmit = async () => {
    if (!messageId || submitting) return;
    setSubmitting(true);
    try {
      await submitReport();
      toast.success(t("messages.report.success"));
      resetAndClose();
    } catch {
      toast.error(t("messages.report.failed"));
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
      toast.error(t("messages.report.failed"));
      setSubmitting(false);
      return;
    }
    try {
      await onReportAndBlock();
      toast.success(t("messages.report.reportAndBlockSuccess"));
      resetAndClose();
    } catch {
      toast.error(t("messages.blockFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (submitting) return;
        if (!next) resetAndClose();
        else onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("messages.report.dialogTitle")}</DialogTitle>
        </DialogHeader>

        <View className="gap-2">
          {REPORT_REASONS.map((r) => (
            <Pressable
              key={r}
              testID={`report-reason-${r}`}
              accessibilityLabel={t(`messages.report.reasons.${r}`)}
              accessibilityRole="radio"
              accessibilityState={{ selected: reason === r }}
              role="radio"
              onPress={() => setReason(r)}
              className="flex-row items-center gap-2 py-1.5"
            >
              <Ionicons
                name={reason === r ? "radio-button-on" : "radio-button-off"}
                size={18}
                color={
                  reason === r ? lightTheme.primary : lightTheme.mutedForeground
                }
              />
              <Text className={cn("text-sm", reason === r && "font-medium")}>
                {t(`messages.report.reasons.${r}`)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Textarea
          testID="report-details-input"
          accessibilityLabel={t("messages.report.detailsPlaceholder")}
          placeholder={t("messages.report.detailsPlaceholder")}
          value={details}
          onChangeText={setDetails}
          numberOfLines={3}
          className="min-h-[80px]"
        />

        <DialogFooter>
          <Button
            variant="outline"
            accessibilityLabel={t("common.cancel")}
            disabled={submitting}
            onPress={resetAndClose}
          >
            <Text>{t("common.cancel")}</Text>
          </Button>
          {onReportAndBlock ? (
            <Button
              variant="destructive"
              testID="report-and-block"
              accessibilityLabel={t("messages.report.reportAndBlock")}
              disabled={submitting || !messageId}
              onPress={() => void handleReportAndBlock()}
            >
              <Text>{t("messages.report.reportAndBlock")}</Text>
            </Button>
          ) : null}
          <Button
            testID="message-report-submit"
            accessibilityLabel={t("messages.report.submit")}
            disabled={submitting || !messageId}
            onPress={() => void handleSubmit()}
          >
            <Text>
              {submitting ? t("messages.report.submitting") : t("messages.report.submit")}
            </Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
