/**
 * PAD-920 (dashboard.blocks new-engine readings, DASHBOARD-BLOCKS-56/57): what a home card shows
 * after a new-engine invitation is answered on `/notify/respond`, one toast per answer, shared by
 * web and iOS. `sorry` and `closed_same_hour` are bad news; so is `class_started`, nothing was taken.
 */
import type { EngineRespondAction } from "@levelup/types";

export interface EngineAnswerToast {
  key: string;
  tone: "good" | "bad";
}

const TOAST: Record<EngineRespondAction, EngineAnswerToast> = {
  confirmed: { key: "dashboard.needsYou.engineAnswer.confirmed", tone: "good" },
  declined: { key: "dashboard.needsYou.engineAnswer.declined", tone: "good" },
  sorry: { key: "dashboard.needsYou.engineAnswer.sorry", tone: "bad" },
  closed_same_hour: { key: "dashboard.needsYou.engineAnswer.closedSameHour", tone: "bad" },
  class_started: { key: "dashboard.needsYou.engineAnswer.classStarted", tone: "bad" },
};

/** The toast for the route's answer; `null` for an answer this client does not know. */
export function engineAnswerToast(action: EngineRespondAction | string): EngineAnswerToast | null {
  return TOAST[action as EngineRespondAction] ?? null;
}
