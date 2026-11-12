/**
 * PAD-920 (notifications.invitations NB1–NB4): a new-engine invitation bubble's state, derived in
 * one place for both shells. The backend sends the state (`msg_metadata.state`) and keeps it current
 * with `message_edited`; this only turns it into buttons, a label key and the shared test ids.
 * Old-engine bubbles (no `engine: "new"`) never come here and keep their own derivation.
 */
import type { EngineInviteMeta, EngineInviteStateName } from "@levelup/types";

/** The shown state: the stored one, or `started` once the class has started (derived, never stored). */
export type EngineInviteShownState = EngineInviteStateName | "started";

export interface EngineInviteView {
  state: EngineInviteShownState;
  /** Yes and No: the student's copy of an open invitation, before the class starts. */
  buttons: boolean;
  /** The line under the bubble; null when the buttons say it all. */
  labelKey: string | null;
  testId: string;
}

export function isEngineInvite(meta: unknown): meta is EngineInviteMeta {
  if (typeof meta !== "object" || meta === null) return false;
  const m = meta as { engine?: unknown; invitationId?: unknown };
  return m.engine === "new" && typeof m.invitationId === "number";
}

export function engineInviteTestIds(invitationId: number): { yes: string; no: string } {
  return { yes: `invite-respond-yes-${invitationId}`, no: `invite-respond-no-${invitationId}` };
}

const CLOSED_LABEL: Partial<Record<EngineInviteStateName, string>> = {
  sorry: "messages.engineInvite.sorry",
  reopened: "messages.engineInvite.reopened",
  withdrawn: "messages.engineInvite.withdrawn",
  closed_same_hour: "messages.engineInvite.closedSameHour",
  class_cancelled: "messages.engineInvite.classCancelled",
};

function answeredLabel(meta: EngineInviteMeta): string | null {
  const byCoach = meta.answeredBy === "coach";
  if (meta.response === "yes") return byCoach ? "messages.acceptedByCoach" : "messages.accepted";
  if (meta.response === "no") return byCoach ? "messages.declinedByCoach" : "messages.declined";
  return null;
}

/** An ISO instant from the backend; a naive one is UTC (the backend's convention). */
function instant(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(/[zZ]$|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
  return Number.isNaN(ms) ? null : ms;
}

/** The class's real start as epoch ms, read exactly as the derivation reads it (a naive ISO is UTC). */
export function engineInviteStartMs(meta: Pick<EngineInviteMeta, "startsAt">): number | null {
  return instant(meta.startsAt);
}

export function engineInviteState(meta: EngineInviteMeta, viewer: "student" | "coach", now: Date): EngineInviteView {
  const startsAt = instant(meta.startsAt);
  // NB1: the class having started is derived, so it never goes stale; it wins over any stored state.
  if (startsAt !== null && now.getTime() >= startsAt) {
    return {
      state: "started",
      buttons: false,
      labelKey: "messages.engineInvite.classStarted",
      testId: `invite-state-${meta.invitationId}-started`,
    };
  }
  const state = meta.state;
  const testId = `invite-state-${meta.invitationId}-${state}`;
  if (state === "open") {
    if (viewer === "student") return { state, buttons: true, labelKey: null, testId };
    // NB3: counting is derived on the coach's copy from `countsUntil`; without it, it still counts.
    const until = instant(meta.countsUntil);
    const counting = until === null || now.getTime() < until;
    return { state, buttons: false, labelKey: counting ? "messages.waitingForResponse" : "messages.engineInvite.notCounting", testId };
  }
  if (state === "answered") return { state, buttons: false, labelKey: answeredLabel(meta), testId };
  return { state, buttons: false, labelKey: CLOSED_LABEL[state] ?? null, testId };
}
