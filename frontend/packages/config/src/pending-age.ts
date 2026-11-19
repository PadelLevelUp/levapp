import { clubDateOfInstant, clubTodayISO } from "./club-date";

/**
 * players.list rule 15 (PAD-834): how many whole days ago a pending player was added, counted
 * on the club's day (Europe/Lisbon), never on the UTC date: a link made at 23:30 UTC in summer
 * belongs to the next club day. `null` when the server sent no `addedAt` (a link with no
 * creation instant): the label then carries no age rather than a guess. One helper for the
 * roster rows and the profile's pending alert, on web and iOS.
 */
export function pendingAgeDays(addedAt: string | null | undefined, now: Date = new Date()): number | null {
  if (!addedAt) return null;
  const added = clubDateOfInstant(addedAt);
  const today = clubTodayISO(now);
  const [ay, am, ad] = added.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  if ([ay, am, ad, ty, tm, td].some((n) => Number.isNaN(n))) return null;
  const days = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
  return Math.max(0, days);
}
