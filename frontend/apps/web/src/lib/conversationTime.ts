import { differenceInCalendarDays, format, isSameYear } from "date-fns";
import { dateFnsLocale } from "./dateLocale";

interface FormatConversationTimestampOptions {
  /** UI language code (e.g. `i18n.language`) used to localize the month. */
  language?: string;
  /** Localized "Yesterday" label (e.g. `t("messages.yesterday")`). */
  yesterdayLabel: string;
  /** Reference "now" — injectable for deterministic tests. Defaults to `new Date()`. */
  now?: Date;
}

/**
 * PAD-98: format a conversation's last-message timestamp for the chat list.
 *
 * Previously the list showed only the time (e.g. "14:32"), so conversations
 * from different days looked identical. This adds a relative day indicator:
 *
 *   - today (or future clock-skew) → time only, e.g. "14:32"
 *   - yesterday                    → localized "Yesterday" / "Ontem"
 *   - earlier this year            → day and month, e.g. "23 Jul" / "23 jul"
 *   - an earlier year              → day, month and year, e.g. "31 Dec 2025"
 *
 * (messaging.conversations rule 19; the phone's `formatConversationTime` does the same.)
 * Month output is localized via the app-wide `dateFnsLocale` helper so it
 * respects the coach's selected UI language (PT/EN). The "yesterday" string is
 * passed in already-translated to keep this helper pure and unit-testable.
 */
export function formatConversationTimestamp(
  iso: string | null,
  { language, yesterdayLabel, now = new Date() }: FormatConversationTimestampOptions,
): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const days = differenceInCalendarDays(now, date);

  if (days <= 0) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (days === 1) {
    return yesterdayLabel;
  }

  const locale = dateFnsLocale(language);
  return format(date, isSameYear(date, now) ? "d MMM" : "d MMM yyyy", { locale });
}
