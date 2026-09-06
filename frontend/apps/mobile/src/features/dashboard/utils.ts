/**
 * Helpers for the generic (backend-driven) dashboard blocks.
 *
 * These live in a plain `.ts` module rather than inside `DashboardBlocks.tsx`
 * because mobile's vitest setup can only test pure modules — component
 * rendering needs the real `react-native`, which the test alias removes
 * (`frontend/CLAUDE.md`).
 */

/**
 * The ISO occurrence date behind a dashboard class-list item.
 *
 * The backend sends `dateLabel` already formatted, in English: `_date_label`
 * (backend/padel_app/tools/tools.py) builds `"{%a} {day} {%b}"`, which has no
 * notion of the app's language — so a Portuguese app showed "Mon 7 Sep" in the
 * student's "As tuas próximas aulas" list (PAD-157 / B-020). The coach
 * dashboard never hit this because it formats from ISO itself, via
 * `shortDate(iso, language)`.
 *
 * The ISO date is still reachable client-side: `href` is the calendar deep link
 * `"/calendar?classId=<id>&date=YYYY-MM-DD"` (`_calendar_href`), and the date
 * is deliberately carried there because it cannot be derived from the item id
 * (a materialized instance id is just `lessoninstance-<pk>`).
 *
 * Returns `null` when there is no usable date, so callers fall back to the
 * server's string rather than rendering nothing.
 */
export function classListItemISODate(
  href: string | null | undefined
): string | null {
  if (!href) return null;
  const match = /[?&]date=(\d{4}-\d{2}-\d{2})(?![\d-])/.exec(href);
  return match ? match[1] : null;
}
