/**
 * The coach's participant list, grouped (PAD-659, `calendar.event-detail` rules 22, 24, 25).
 *
 * ── Why this module exists ───────────────────────────────────────────────
 *
 * A class of 16 used to show 16 tall cards in payload order, each with its own
 * state word, under a "Participantes (4/16)" that counted only the coming ones.
 * The coach could see about eight at once and had to read every row to know who
 * was coming. The list is now three groups — Vão, Por responder, Não vão — each
 * ordered by court side and then by name, and this module is the only place that
 * decides the grouping and the order, so the web and mobile lists cannot drift.
 *
 * ── Why `attended` / `missed` count as intent here (PAD-663) ─────────────
 *
 * A coach's mark is stored validated (`lesson_service.add_presences`), so a coach
 * who marks a student present for tomorrow's class produces `attended`, and the
 * old row said "Presente" for a class that had not happened. To a coach looking
 * at a class that mark means "vai", the same as a student's "Vou"; the record
 * words belong to after the class (`displayStateOf`) and to the validation dialog.
 */

import type { AttendanceState } from "./attendance-state";
import { attendanceStateOf } from "./attendance-state";
import { lisbonNowMs, wallClockMs } from "./club-date";

export type ParticipantGroupKey = "going" | "pending" | "not_going";

/** Display order of the groups (rule 22). */
export const PARTICIPANT_GROUP_ORDER: readonly ParticipantGroupKey[] = ["going", "pending", "not_going"];

type Side = "left" | "right" | "both";

/** Court side order inside a group: both, right, left; no side last. */
const SIDE_RANK: Record<Side, number> = { both: 0, right: 1, left: 2 };
const NO_SIDE_RANK = 3;

/** The short chip text and the tooltip, as i18n keys (`calendar.participants.side*`). */
export const SIDE_SHORT_KEYS: Record<Side, string> = {
  both: "calendar.participants.sideShort.both",
  right: "calendar.participants.sideShort.right",
  left: "calendar.participants.sideShort.left",
};
export const SIDE_LONG_KEYS: Record<Side, string> = {
  both: "calendar.participants.sideLong.both",
  right: "calendar.participants.sideLong.right",
  left: "calendar.participants.sideLong.left",
};

/** Group titles ("Vão · 4") and the pop-up's "Nesta aula" word ("Vai"). */
export const PARTICIPANT_GROUP_TITLE_KEYS: Record<ParticipantGroupKey, string> = {
  going: "calendar.participants.group.going",
  pending: "calendar.participants.group.pending",
  not_going: "calendar.participants.group.not_going",
};
export const PARTICIPANT_GROUP_WORD_KEYS: Record<ParticipantGroupKey, string> = {
  going: "calendar.participants.state.going",
  pending: "calendar.participants.state.pending",
  not_going: "calendar.participants.state.not_going",
};

type ParticipantLike = { id: string | number; user?: { name?: string | null } | null };
type PresenceLike = NonNullable<Parameters<typeof attendanceStateOf>[0]> & { playerId?: string | number | null };
type RosterLike = {
  playerId?: string | number | null;
  name?: string | null;
  /** PAD-660: the coach's display name for the student (their nickname when shown as the name). */
  displayName?: string | null;
  side?: Side | null;
  level?: { label?: string | null } | null;
};

export type ParticipantRowModel<P extends ParticipantLike, Pr extends PresenceLike, R extends RosterLike> = {
  playerId: string;
  /** What the coach's list shows: the roster's displayName (PAD-660), else the real name. */
  name: string;
  /** The student's real name, for the pop-up's line under a nickname. */
  realName: string;
  side: Side | null;
  level: R["level"] | null;
  /** `attendance.presence` rule 9's stored value, kept for `data-state`. */
  state: AttendanceState;
  player: P;
  presence: Pr | null;
  roster: R | null;
};

export type ParticipantGroup<P extends ParticipantLike, Pr extends PresenceLike, R extends RosterLike> = {
  key: ParticipantGroupKey;
  rows: Array<ParticipantRowModel<P, Pr, R>>;
};

/** Which group a stored state belongs to (rule 22). */
export function groupOfState(state: AttendanceState): ParticipantGroupKey {
  switch (state) {
    case "coming":
    case "attended":
      return "going";
    case "not_coming":
    case "missed":
      return "not_going";
    case "planned":
    default:
      return "pending";
  }
}

// One collator, built once: `localeCompare` builds a fresh one per call.
const collator = new Intl.Collator("pt", { sensitivity: "base" });

/**
 * Group and order a class's participants for the coach (rule 22).
 *
 * Side and level are not on a class participant; they come from the coach's
 * roster, joined on the player id. A participant missing from the roster (an
 * academy booking from someone the coach never added) sorts as "no side" and has
 * no level. Empty groups are left out.
 */
export function groupParticipants<P extends ParticipantLike, Pr extends PresenceLike, R extends RosterLike>(input: {
  participants: readonly P[] | null | undefined;
  presences: readonly Pr[] | null | undefined;
  roster: readonly R[] | null | undefined;
}): Array<ParticipantGroup<P, Pr, R>> {
  const presenceBy = new Map<string, Pr>();
  for (const pr of input.presences ?? []) {
    if (pr.playerId != null) presenceBy.set(String(pr.playerId), pr);
  }
  const rosterBy = new Map<string, R>();
  for (const r of input.roster ?? []) {
    if (r.playerId != null) rosterBy.set(String(r.playerId), r);
  }

  const buckets: Record<ParticipantGroupKey, Array<ParticipantRowModel<P, Pr, R>>> = {
    going: [],
    pending: [],
    not_going: [],
  };
  for (const player of input.participants ?? []) {
    const playerId = String(player.id);
    const presence = presenceBy.get(playerId) ?? null;
    const roster = rosterBy.get(playerId) ?? null;
    const state = attendanceStateOf(presence);
    const realName = player.user?.name ?? roster?.name ?? "";
    buckets[groupOfState(state)].push({
      playerId,
      // PAD-660 (players.nickname rule 3): this coach's roster is the only source of a nickname.
      name: roster?.displayName || realName,
      realName,
      side: roster?.side ?? null,
      level: roster?.level ?? null,
      state,
      player,
      presence,
      roster,
    });
  }

  const rank = (side: Side | null) => (side ? SIDE_RANK[side] : NO_SIDE_RANK);
  return PARTICIPANT_GROUP_ORDER.filter((key) => buckets[key].length > 0).map((key) => ({
    key,
    rows: buckets[key].sort((a, b) => rank(a.side) - rank(b.side) || collator.compare(a.name, b.name)),
  }));
}

/**
 * The state a display should word (rule 25, PAD-663): before a class ends, a
 * coach's validated mark reads as the intent it records — `attended` as
 * `coming`, `missed` as `not_coming` — so the same student in the same class
 * reads "Vai" whoever marked. After the end, the record keeps its own word. The
 * stored value is untouched: `data-state` and test ids keep reading it.
 */
export function displayStateOf(state: AttendanceState, classEnded: boolean): AttendanceState {
  if (classEnded) return state;
  if (state === "attended") return "coming";
  if (state === "missed") return "not_coming";
  return state;
}

/**
 * Rule 24: the live event that means "a presence in the open class changed".
 * Both shells refetch the class on it, so a player moves group without a reload.
 */
export function presenceChangedFor(
  evt: { type?: unknown; payload?: unknown } | null | undefined,
  instanceId: number | string | null | undefined,
  occurrence?: { lessonId?: number | string | null; date?: string | null } | null
): boolean {
  if (!evt || evt.type !== "presence_changed") return false;
  const payload = evt.payload as
    | { lessonInstanceId?: unknown; lessonId?: unknown; date?: unknown }
    | null
    | undefined;
  if (!payload) return false;
  if (instanceId != null && payload.lessonInstanceId != null) {
    if (String(payload.lessonInstanceId) === String(instanceId)) return true;
  }
  // B-548: an occurrence the sheet opened before it was materialised has no instance id;
  // the write that materialised it names the lesson and the date.
  if (occurrence?.lessonId != null && occurrence.date && payload.lessonId != null && payload.date != null) {
    return String(payload.lessonId) === String(occurrence.lessonId) && String(payload.date) === occurrence.date;
  }
  return false;
}

/**
 * Rule 25: has the class ended, on the club's clock? The one input `displayStateOf` needs, so
 * no shell compares times of its own. `endTime` "24:00" is midnight at the end of `date`.
 * A class whose date or time cannot be read counts as not ended: the intent words are the safe
 * reading for a class nobody can place in time.
 */
export function classHasEnded(date: string, endTime: string, now: Date = new Date()): boolean {
  const end = wallClockMs(date, endTime);
  return !Number.isNaN(end) && end <= lisbonNowMs(now);
}

/**
 * B-548: the open class's instance id, for matching live events. The web sheet's
 * `classInstance.id` is the CALENDAR EVENT id ("lessoninstance-12", "lesson-5-2026-10-17"),
 * never the instance number, so it cannot be compared with a payload's `lessonInstanceId`.
 * Read it from a presence (every presence names its instance), else from a
 * "lessoninstance-<n>" event id, else from an event that is itself an instance. A class not
 * yet materialised has none: match it by lesson and date instead (`presenceChangedFor`).
 */
export function liveInstanceIdOf(
  classInstance: { id?: unknown; presences?: ReadonlyArray<{ lessonInstanceId?: unknown }> | null } | null | undefined,
  event: { model?: unknown; originalId?: unknown } | null | undefined
): number | null {
  const fromPresence = classInstance?.presences?.find((p) => p?.lessonInstanceId != null)?.lessonInstanceId;
  if (fromPresence != null && Number.isFinite(Number(fromPresence))) return Number(fromPresence);
  const match = /^lessoninstance-(\d+)$/.exec(String(classInstance?.id ?? ""));
  if (match) return Number(match[1]);
  if (event?.model === "LessonInstance" && event.originalId != null && Number.isFinite(Number(event.originalId))) {
    return Number(event.originalId);
  }
  return null;
}

/** Group dot colours from the approved design (rule 22's table). */
export const PARTICIPANT_GROUP_DOT: Record<ParticipantGroupKey, string> = {
  going: "#12946B",
  pending: "#8592A8",
  not_going: "#D3453B",
};

/** The avatar's initials: first and last name, upper-cased; "?" for an empty name. */
export function participantInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (parts[0][0] + last).toUpperCase();
}
