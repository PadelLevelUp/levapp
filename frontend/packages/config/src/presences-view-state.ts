import {
  DEFAULT_VISIBLE_COLUMNS,
  resolvePresencesView,
  type PresenceColumnKey,
} from "./presence-columns";

/**
 * settings.coach-presences-view rules 4 to 6 (PAD-837b): the Presences tab's column state, one
 * small pure machine for both shells (web's chooser, iOS's columns sheet).
 *
 * - A load applies the saved view unless the coach already chose columns (rule 5): `touched`.
 * - A choice marks the state touched and sends the whole list (rule 4).
 * - A save that failed keeps the columns and says so (rule 6): `unsaved`.
 */
export interface PresencesViewState {
  columns: PresenceColumnKey[];
  /** The coach changed the columns on this screen: a late load must not replace them. */
  touched: boolean;
  /** The last save failed: the screen keeps these columns and a notice says they were not saved. */
  unsaved: boolean;
}

export function initialPresencesView(): PresencesViewState {
  return { columns: [...DEFAULT_VISIBLE_COLUMNS], touched: false, unsaved: false };
}

/** The server's answer arrived: shown unless the coach got there first. */
export function applyLoadedView(state: PresencesViewState, stored: unknown): PresencesViewState {
  if (state.touched) return state;
  return { ...state, columns: resolvePresencesView(stored) };
}

/** The coach chose these columns (already in the list's order, as `toggleColumn` returns them). */
export function chooseColumns(state: PresencesViewState, columns: PresenceColumnKey[]): PresencesViewState {
  return { columns, touched: true, unsaved: false };
}

export function saveSucceeded(state: PresencesViewState): PresencesViewState {
  return state.unsaved ? { ...state, unsaved: false } : state;
}

/** The save was refused or never arrived: the columns stay, and the notice says so. */
export function saveFailed(state: PresencesViewState): PresencesViewState {
  return { ...state, unsaved: true };
}

/** What a save sends: the whole list. */
export function presencesViewPayload(columns: PresenceColumnKey[]): { columns: string[] } {
  return { columns: [...columns] };
}
