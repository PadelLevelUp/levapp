import { differenceInCalendarDays, format } from "date-fns";
import { dateFnsLocale } from "./dateLocale";

interface FormatConversationTimestampOptions {
  /** UI language code (e.g. `i18n.language`) used to localize weekday/date. */
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
 *   - within the last week         → weekday abbreviation, e.g. "Mon" / "Seg"
 *   - older                        → short localized date, e.g. "27/07/2026"
 *
 * Weekday/date output is localized via the app-wide `dateFnsLocale` helper so it
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
  if (days < 7) {
    return format(date, "EEE", { locale });
  }
  return format(date, "P", { locale });
}
