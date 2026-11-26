import { blockedNames, blockedReasons, shouldReportSent, splitBlockedByCause, type BlockedLike } from "@levelup/config";

/** The toasts the class screen shows; `@/components/ui/toast`'s `toast` in the app, a fake in tests. */
export interface ReminderToasts {
  success: (title: string) => void;
  warning: (title: string, description?: string) => void;
  error: (title: string) => void;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;
type NameOf = (playerId: string | number | undefined, fallback: string | null | undefined) => string;

/** Engine #16's causes (class-reminders-manual rule 6): one line each, naming the students. */
export const NOT_ASKED_KEYS = {
  alreadyConfirmed: "calendar.notify.remindAlreadyConfirmed",
  notComing: "calendar.notify.remindNotComing",
  reminderLimit: "calendar.notify.remindLimitReached",
} as const;

/**
 * What the class screen tells the coach after "send reminders" (class-reminders-manual rule 7, as web's
 * ClassDetailSheet): `blocked` split by cause through the shared `splitBlockedByCause`, one line per
 * cause naming its students, and "reminders sent to N" only when some went out or nobody was skipped.
 */
export function reportReminders(
  { sent, blocked }: { sent: number; blocked: BlockedLike[] | null | undefined },
  t: Translate,
  toasts: ReminderToasts,
  nameOf?: NameOf
): void {
  const split = splitBlockedByCause(blocked);
  if (split.unavailable.length > 0) {
    toasts.error(
      t("calendar.unavailable.blocked", { count: split.unavailable.length, names: blockedNames(split.unavailable) })
    );
  }
  // PAD-239: a student's own opt-out is a caveat, not a failure — warning slot, as on web.
  if (split.optedOut.length > 0) {
    toasts.warning(
      t("calendar.notify.blockedByPreference", { names: blockedNames(split.optedOut) }),
      blockedReasons(split.optedOut) || undefined
    );
  }
  for (const group of ["alreadyConfirmed", "notComing", "reminderLimit"] as const) {
    if (split[group].length > 0) {
      toasts.warning(t(NOT_ASKED_KEYS[group], { names: blockedNames(split[group], nameOf) }));
    }
  }
  if (shouldReportSent(sent, blocked)) {
    toasts.success(t("calendar.detail.remindersSent", { count: sent }));
  }
}
