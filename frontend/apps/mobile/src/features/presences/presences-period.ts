import {
  customPresencePeriod,
  presencePeriod,
  type PresencePeriod,
  type PresencePeriodShortcut,
  type SeasonOccurrenceRange,
} from "@levelup/config";

import { DEFAULT_SORT, type PresenceSort } from "./report-state";

/**
 * PAD-837c (attendance.validation rules 17f, 17g; criteria 67, 70, 72) — the Presences tab's
 * period on iOS, as pure state.
 *
 * The coach's choice is a shortcut or a custom from/to; what it *means* in days comes from
 * `@levelup/config` (`presencePeriod`, `customPresencePeriod`), so web and iOS send the same
 * bounds for the same choice (criterion 70). The period the tab shows is never this choice: it is
 * the `from`/`to` the server echoed (rule 17g, criterion 67), so a window the server clamped to
 * today reads as what was counted.
 *
 * The default is per coach, in the saved view (`@levelup/config` `presences-view-state`,
 * `defaultPeriod`), and each open starts from it (criterion 72): the screen holds `null` until
 * the coach picks, and `null` reads as the default — so a saved view that lands after mount, or
 * a new default, takes effect at once without undoing a choice.
 */
export type PresencePeriodChoice =
  | { kind: "shortcut"; shortcut: PresencePeriodShortcut }
  | { kind: "custom"; from: string; to: string };

export function shortcutChoice(shortcut: PresencePeriodShortcut): PresencePeriodChoice {
  return { kind: "shortcut", shortcut };
}

/** The choice in force: the coach's, or the default while they have not picked. */
export function effectiveChoice(
  choice: PresencePeriodChoice | null,
  defaultPeriod: PresencePeriodShortcut
): PresencePeriodChoice {
  return choice ?? shortcutChoice(defaultPeriod);
}

/**
 * The bounds a choice sends. A shortcut is `@levelup/config`'s; a custom range is only ever
 * stored once `customPresencePeriod` accepted it, so `null` here is "season" without a season.
 */
export function periodBounds(
  choice: PresencePeriodChoice,
  now: Date = new Date(),
  season: SeasonOccurrenceRange | null = null
): PresencePeriod | null {
  if (choice.kind === "custom") return customPresencePeriod(choice.from, choice.to);
  return presencePeriod(choice.shortcut, now, season);
}

export function isDefaultChoice(
  choice: PresencePeriodChoice,
  defaultPeriod: PresencePeriodShortcut
): boolean {
  return choice.kind === "shortcut" && choice.shortcut === defaultPeriod;
}

/**
 * What the tab holds when it is opened (criterion 72): no choice of its own (so the default
 * applies) and the table's default sort. The columns are not here: they are the saved ones.
 */
export function tabOpenState(): { choice: PresencePeriodChoice | null; sort: PresenceSort } {
  return { choice: null, sort: DEFAULT_SORT };
}

/**
 * "18/08/2026" from the server's `from`/`to` (an ISO date, with or without a time). Day first,
 * as the club writes dates; no locale call, so the label is the same text on every phone.
 */
export function formatPeriodDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/**
 * The period the tab shows: the payload's echoed bounds, never the requested ones (rule 17g).
 * `null` while there is no payload for the current period — the screen shows a placeholder
 * rather than the choice, which could read as counted days the server cut.
 */
export function echoedPeriodLabel(
  payload: { from: string; to: string } | undefined
): string | null {
  if (!payload) return null;
  return `${formatPeriodDay(payload.from)} – ${formatPeriodDay(payload.to)}`;
}
