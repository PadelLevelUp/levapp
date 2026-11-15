import {
  DEFAULT_VISIBLE_COLUMNS,
  FALLBACK_DEFAULT_PERIOD,
  resolveDefaultPeriod,
  resolvePresencesView,
  type PresenceColumnKey,
} from "./presence-columns";
import type { PresencePeriodShortcut } from "./presence-periods";

/**
 * settings.coach-presences-view rules 4 to 6 (PAD-837b): the Presences tab's saved view, one
 * small pure machine for both shells (web's chooser, iOS's columns sheet, and the period control).
 *
 * - A load applies the saved view unless the coach already chose (rule 5): `touched` for the
 *   columns, `defaultChosen` for the default period, each on its own.
 * - A choice marks its field and sends the whole view, both fields (rule 4), so saving one never
 *   erases the other.
 * - A save that failed keeps the choice and says so (rule 6): `unsaved`.
 */
export interface PresencesViewState {
  columns: PresenceColumnKey[];
  /** The coach's default period (attendance.validation rule 17f): what the tab opens on. */
  defaultPeriod: PresencePeriodShortcut;
  /** The coach changed the columns on this screen: a late load must not replace them. */
  touched: boolean;
  /** The coach made a period their default on this screen: a late load must not replace it. */
  defaultChosen: boolean;
  /** The last save failed: the screen keeps the choice and a notice says it was not saved. */
  unsaved: boolean;
}

export function initialPresencesView(): PresencesViewState {
  return {
    columns: [...DEFAULT_VISIBLE_COLUMNS],
    defaultPeriod: FALLBACK_DEFAULT_PERIOD,
    touched: false,
    defaultChosen: false,
    unsaved: false,
  };
}

/** The server's answer arrived: each field shown unless the coach got there first. */
export function applyLoadedView(state: PresencesViewState, stored: unknown): PresencesViewState {
  return {
    ...state,
    columns: state.touched ? state.columns : resolvePresencesView(stored),
    defaultPeriod: state.defaultChosen ? state.defaultPeriod : resolveDefaultPeriod(stored),
  };
}

/** The coach chose these columns (already in the list's order, as `toggleColumn` returns them). */
export function chooseColumns(state: PresencesViewState, columns: PresenceColumnKey[]): PresencesViewState {
  return { ...state, columns, touched: true, unsaved: false };
}

/** The coach made this period their default ("Usar como predefinido"). */
export function chooseDefaultPeriod(
  state: PresencesViewState,
  defaultPeriod: PresencePeriodShortcut
): PresencesViewState {
  return { ...state, defaultPeriod, defaultChosen: true, unsaved: false };
}

export function saveSucceeded(state: PresencesViewState): PresencesViewState {
  return state.unsaved ? { ...state, unsaved: false } : state;
}

/** The save was refused or never arrived: the choice stays, and the notice says so. */
export function saveFailed(state: PresencesViewState): PresencesViewState {
  return { ...state, unsaved: true };
}

/** What a save sends: the whole view, both fields (rule 4). */
export function presencesViewPayload(
  state: Pick<PresencesViewState, "columns" | "defaultPeriod">
): { columns: string[]; defaultPeriod: PresencePeriodShortcut } {
  return { columns: [...state.columns], defaultPeriod: state.defaultPeriod };
}
