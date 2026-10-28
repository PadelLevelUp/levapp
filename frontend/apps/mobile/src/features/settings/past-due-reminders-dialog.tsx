import { notificationEngineApi } from "@levelup/api";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";

/**
 * PAD-776 part 3 (notifications.config rule 10f), the port of web's PastDueRemindersDialog: a saved
 * timing put the reminder time of these classes in the past. The save sent nothing; this asks the
 * coach, once, whether to send now. Owner-approved copy (2026-10-02), shared with web: the body
 * ends with the question and the two buttons name the two outcomes. Nothing is pre-chosen; closing
 * the dialog is "do not send".
 */
export interface PastDueRemindersDialogProps {
  /** The classes asked about. One choice covers them all. Never empty. */
  classes: PastDueClass[];
  /** Set inside the coach's quiet hours: a yes is sent at this UTC instant, not now. */
  quietUntil: string | null;
  sending: boolean;
  /** The last attempt to send failed; the dialog stays open so the coach can try again. */
  failed: boolean;
  onSend: () => void;
  onDecline: () => void;
}

type PastDueClass = notificationEngineApi.PastDueClass;
type PastDueSendResult = notificationEngineApi.PastDueSendResult;

/** How many classes are named before the rest are counted (web's LISTED). */
const LISTED = 5;

/** `2027-07-12T18:00:00` is the class's wall clock, with no zone: read its parts, never shift it. */
export function wallClock(startsAt: string, language: string): { day: string; time: string } {
  const [date, clock = ""] = startsAt.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(y, (m || 1) - 1, d || 1).toLocaleDateString(language, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return { day, time: clock.slice(0, 5) };
}

/**
 * The coach's yes: one request names at most PAST_DUE_SEND_MAX classes, so a longer list goes in
 * several, one after the other. A failure throws and the dialog stays open; trying again is safe
 * because the server checks every class again and sends nothing twice. As web's sendPastDue.
 */
export async function sendPastDueInParts(keys: string[]): Promise<PastDueSendResult> {
  const result: PastDueSendResult = { sent: 0, scheduledFor: null, classes: [], skipped: 0 };
  for (let from = 0; from < keys.length; from += notificationEngineApi.PAST_DUE_SEND_MAX) {
    const part = await notificationEngineApi.sendPastDueReminders(
      keys.slice(from, from + notificationEngineApi.PAST_DUE_SEND_MAX),
    );
    result.sent += part.sent;
    result.skipped += part.skipped;
    result.classes.push(...part.classes);
    if (part.scheduledFor && (!result.scheduledFor || part.scheduledFor < result.scheduledFor)) {
      result.scheduledFor = part.scheduledFor;
    }
  }
  return result;
}

/** What the coach is told after a yes: sent, scheduled for a time, or nothing left to send. */
export function pastDueOutcome(
  result: PastDueSendResult,
  asked: number,
  language: string,
): { key: string; values?: Record<string, string | number> } {
  if (result.scheduledFor) {
    const time = new Date(result.scheduledFor).toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" });
    return { key: asked === 1 ? "settings.engine.pastDue.scheduledOne" : "settings.engine.pastDue.scheduledMany", values: { time } };
  }
  if (result.sent > 0) {
    const classes = result.classes.filter((c) => c.sent > 0).length || asked;
    return classes === 1
      ? { key: "settings.engine.pastDue.sentOne" }
      : { key: "settings.engine.pastDue.sentMany", values: { count: classes } };
  }
  // The server checks each class again: its reminder may have gone out in the meantime.
  return { key: "settings.engine.pastDue.nothingToSend" };
}

export function PastDueRemindersDialog({ classes, quietUntil, sending, failed, onSend, onDecline }: PastDueRemindersDialogProps) {
  const { t, i18n } = useTranslation();
  const language = i18n?.language ?? "pt";
  const sendAt = quietUntil
    ? new Date(quietUntil).toLocaleTimeString(language, { hour: "2-digit", minute: "2-digit" })
    : null;
  const one = classes.length === 1 ? classes[0] : null;
  const label = (c: PastDueClass) => {
    const { day, time } = wallClock(c.startsAt, language);
    return { class: c.title, day, time };
  };
  const sendLabel = sendAt
    ? t("settings.engine.pastDue.sendAt", { time: sendAt })
    : one
      ? t("settings.engine.pastDue.sendOne")
      : t("settings.engine.pastDue.sendMany");

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !sending) onDecline();
      }}
    >
      <AlertDialogContent testID="past-due-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{t(one ? "settings.engine.pastDue.titleOne" : "settings.engine.pastDue.titleMany")}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <View className="gap-2" testID="past-due-body">
              {one ? (
                <Text className="text-sm text-muted-foreground">
                  {sendAt
                    ? t("settings.engine.pastDue.bodyOneQuiet", { ...label(one), sendAt })
                    : t("settings.engine.pastDue.bodyOne", label(one))}
                </Text>
              ) : (
                <>
                  <Text className="text-sm text-muted-foreground">
                    {t("settings.engine.pastDue.introMany", { count: classes.length })}
                  </Text>
                  <View testID="past-due-list" className="gap-0.5 pl-2">
                    {classes.slice(0, LISTED).map((c) => (
                      <Text key={c.key} className="text-sm text-muted-foreground">
                        {`• ${t("settings.engine.pastDue.listItem", label(c))}`}
                      </Text>
                    ))}
                    {classes.length > LISTED ? (
                      <Text className="text-sm text-muted-foreground">
                        {`• ${t("settings.engine.pastDue.andMore", { count: classes.length - LISTED })}`}
                      </Text>
                    ) : null}
                  </View>
                  <Text className="text-sm text-muted-foreground">
                    {sendAt
                      ? t("settings.engine.pastDue.questionManyQuiet", { sendAt })
                      : t("settings.engine.pastDue.questionMany")}
                  </Text>
                </>
              )}
            </View>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failed ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive" testID="past-due-error">
            {t("settings.engine.pastDue.sendFailed")}
          </Text>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel
            testID="past-due-decline"
            accessibilityLabel={t("settings.engine.pastDue.decline")}
            disabled={sending}
          >
            <Text>{t("settings.engine.pastDue.decline")}</Text>
          </AlertDialogCancel>
          {/* Not AlertDialogAction: on native it closes the dialog before its onPress (no
              preventDefault there), which would read as "do not send". The dialog stays open until
              the server has answered, so a failure is shown here, not lost. */}
          <Button testID="past-due-send" accessibilityLabel={sendLabel} disabled={sending} onPress={onSend}>
            {sending ? <Spinner /> : null}
            <Text>{sendLabel}</Text>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
