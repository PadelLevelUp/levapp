/**
 * PAD-920 (notifications.invitations NB1–NB4): a new-engine invitation bubble's state, derived in
 * one place for both shells. The backend sends the state (`msg_metadata.state`) and keeps it current
 * with `message_edited`; this only turns it into buttons, a label key and the shared test ids.
 * Old-engine bubbles (no `engine: "new"`) never come here and keep their own derivation.
 */
import type { EngineInviteMeta, EngineInviteStateName } from "@levelup/types";

export interface EngineInviteView {
  state: EngineInviteStateName;
  /** Yes and No: the student's copy of an open invitation only. */
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
  reoffered: "messages.engineInvite.reoffered",
  closed_same_hour: "messages.bookedSameDay",
  class_started: "messages.engineInvite.classStarted",
};

function answeredLabel(meta: EngineInviteMeta): string | null {
  const byCoach = meta.answeredBy === "coach";
  if (meta.response === "yes") return byCoach ? "messages.acceptedByCoach" : "messages.accepted";
  if (meta.response === "no") return byCoach ? "messages.declinedByCoach" : "messages.declined";
  return null;
}

export function engineInviteState(meta: EngineInviteMeta, viewer: "student" | "coach"): EngineInviteView {
  const state = meta.state;
  const testId = `invite-state-${meta.invitationId}-${state}`;
  if (state === "open") {
    if (viewer === "student") return { state, buttons: true, labelKey: null, testId };
    const labelKey = meta.counting === false ? "messages.engineInvite.notCounting" : "messages.waitingForResponse";
    return { state, buttons: false, labelKey, testId };
  }
  if (state === "answered") return { state, buttons: false, labelKey: answeredLabel(meta), testId };
  return { state, buttons: false, labelKey: CLOSED_LABEL[state] ?? null, testId };
}
