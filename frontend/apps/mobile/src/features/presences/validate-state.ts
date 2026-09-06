import {
  effectiveMark,
  fromMark,
  undecidedCount,
  type PresenceMark,
} from "@levelup/config";
import type {
  AbsenceJustification,
  PendingValidationClass,
  PendingValidationPlayer,
  PresenceStatus,
} from "@levelup/types";

/**
 * PAD-185 — the roster-diff and selection arithmetic behind the iOS validate flow.
 *
 * Everything here is pure. `ValidateClassesSheet` is a React Native tree that the
 * mobile vitest project deliberately cannot render (see `vitest.config.ts`: the
 * `react-native` alias replaces the real package, so component tests are Maestro's
 * job). Keeping the parts that can actually be wrong — dedupe of a walk-in against
 * the server's own row, which classes a bulk validate may touch, what payload a
 * class resolves to — in this module is what makes them testable at all.
 *
 * The rules encoded here come from `.specflow/specs/attendance/validation.spec.md`
 * (rules 5-8) and match `ValidateClassesDialog.tsx` on web one for one; the two
 * shells must not drift on what "ready" or "skipped" means.
 */

export interface RosterOption {
  id: number;
  name: string;
}

/** Per class, per player: the mark the coach chose locally, not yet persisted. */
export type Edits = Record<number, Record<number, PresenceMark>>;

/** Per class: walk-ins the coach added locally, not yet persisted. */
export type Extras = Record<number, PendingValidationPlayer[]>;

export interface ValidatePresence {
  playerId: number;
  status: PresenceStatus;
  justification?: AbsenceJustification;
}

/**
 * A locally added walk-in, shaped so it renders like any other roster row.
 *
 * `presenceId` is negative because no `Presence` row exists yet — the id only
 * has to be unique within the class, and a negated player id cannot collide
 * with a real (positive) presence id.
 *
 * `guest: true` is a display-time assertion, not a claim about the database:
 * per `attendance.validation` rule 10 a guest is a player with a presence on an
 * instance but no `Association_PlayerLesson` on the parent lesson, which is
 * exactly what adding someone who was not enrolled produces. It is never derived
 * from `Presence.invited` — that column is set for every enrolled player at
 * materialization and identifies nobody (B-017).
 */
export function makeWalkIn(option: RosterOption): PendingValidationPlayer {
  return {
    presenceId: -option.id,
    playerId: option.id,
    name: option.name,
    response: "none",
    status: null,
    justification: null,
    validated: false,
    lateCancellation: false,
    guest: true,
  };
}

/**
 * Merge a class's local walk-ins into its player list.
 *
 * Deduped by `playerId`, not just at add time: once the class is validated the
 * refetch returns the walk-in as a real presence row, and a leftover local entry
 * for the same person would render them twice (with a duplicate React key). The
 * server's row always wins.
 */
export function withExtras(
  klass: PendingValidationClass,
  extras: Extras
): PendingValidationClass {
  const added = (extras[klass.lessonInstanceId] ?? []).filter(
    (extra) => !klass.players.some((p) => p.playerId === extra.playerId)
  );
  if (!added.length) return klass;
  return { ...klass, players: [...klass.players, ...added] };
}

/** Roster entries not already on this class — the only people addable to it. */
export function availableRoster(
  roster: RosterOption[],
  klass: PendingValidationClass
): RosterOption[] {
  return roster.filter(
    (option) => !klass.players.some((p) => p.playerId === option.id)
  );
}

/**
 * Narrow a roster by a free-text query.
 *
 * Case- and accent-insensitive: a coach typing "goncalo" on an iOS keyboard must
 * still find "Gonçalo", and the picker is the only way to add a walk-in.
 */
export function filterRoster(
  roster: RosterOption[],
  query: string
): RosterOption[] {
  const needle = normalize(query);
  if (!needle) return roster;
  return roster.filter((option) => normalize(option.name).includes(needle));
}

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** How many players still have no determination — what blocks validating (rule 5). */
export function remainingFor(
  klass: PendingValidationClass,
  edits: Edits
): number {
  return undecidedCount(klass.players, edits[klass.lessonInstanceId] ?? {});
}

/**
 * The payload for one class: every player with a resolved mark.
 *
 * Undecided players are dropped rather than defaulted — a class with any of them
 * cannot be validated in the first place, and a partial save must not invent an
 * answer for someone the coach never ruled on.
 */
export function resolvePresences(
  klass: PendingValidationClass,
  classEdits: Record<number, PresenceMark>
): ValidatePresence[] {
  return klass.players.flatMap((player) => {
    const mark = effectiveMark(player, classEdits[player.playerId]);
    return mark ? [{ playerId: player.playerId, ...fromMark(mark) }] : [];
  });
}

/** Undecided players first — the coach should see what is blocking them. */
export function sortPlayers(
  players: PendingValidationPlayer[],
  edits: Record<number, PresenceMark>
): PendingValidationPlayer[] {
  return [...players].sort((a, b) => {
    const aDone = effectiveMark(a, edits[a.playerId]) !== null;
    const bDone = effectiveMark(b, edits[b.playerId]) !== null;
    if (aDone !== bDone) return aDone ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

/** Ids of the classes that could be validated right now. */
export function readyClassIds(
  classes: PendingValidationClass[],
  edits: Edits
): number[] {
  return classes
    .filter((klass) => remainingFor(klass, edits) === 0)
    .map((klass) => klass.lessonInstanceId);
}

/** Checkbox semantics: present ids come out, absent ids go in. */
export function toggleSelection(selected: number[], id: number): number[] {
  return selected.includes(id)
    ? selected.filter((x) => x !== id)
    : [...selected, id];
}

/**
 * Split a selection into what a bulk validate may write and what it must skip.
 *
 * Rule 7: bulk validation never force-approves. A class with an undecided player
 * is returned to the selection with an explanation instead of being confirmed on
 * the coach's behalf.
 */
export function partitionSelection(
  classes: PendingValidationClass[],
  selected: number[],
  edits: Edits
): { ready: PendingValidationClass[]; needs: PendingValidationClass[] } {
  const chosen = classes.filter((klass) =>
    selected.includes(klass.lessonInstanceId)
  );
  return {
    ready: chosen.filter((klass) => remainingFor(klass, edits) === 0),
    needs: chosen.filter((klass) => remainingFor(klass, edits) > 0),
  };
}

/** Drop the ids a validate call just consumed, keeping the rest selected. */
export function clearValidated(
  selected: number[],
  validatedIds: number[]
): number[] {
  const done = new Set(validatedIds);
  return selected.filter((id) => !done.has(id));
}
