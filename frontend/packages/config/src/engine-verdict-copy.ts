/**
 * PAD-920 (notifications.invite-simulation N6): the words for the new engine's dry run. One helper
 * turns each stage and each `not_in_pool` reason code into a line, for the simulation, the tutorial
 * (settings.tutorials NT1–NT2) and the approval card (semi-auto-approval N5), on web and iOS. The
 * engine's own stage word is the input, never translated twice; an unknown code reads "Other reason".
 */
import type { EngineNotInPoolReason, EngineVerdict } from "@levelup/types";
import { describeEligibilityFailure, type I18nText } from "./invite-simulation";

export const ENGINE_STAGES = [
  "in_session",
  "said_no",
  "removed_by_coach",
  "busy_same_time",
  "postponed",
  "failed_eligibility",
  "failed_tier_rule",
  "invited_before",
  "invited",
  "invited_for_other_type",
  "invited_earlier",
  "waiting",
] as const;

export const ENGINE_NOT_IN_POOL_REASONS = [
  "excluded_for_session",
  "excluded_players",
  "same_day_class",
  "inactive_account",
  "eligibility",
  "blocks_auto_invitations",
  "blocks_all",
  "availability_blocker",
] as const;

const STAGES = new Set<string>(ENGINE_STAGES);
const REASONS = new Set<string>(ENGINE_NOT_IN_POOL_REASONS);
const OTHER: I18nText = { key: "tutorials.engine.other" };

export function engineStageLine(stage: string): I18nText {
  return STAGES.has(stage) ? { key: `tutorials.engine.stage.${stage}` } : OTHER;
}

/** One reason's lines: `eligibility` gives today's line per failure, every other code one line. */
export function engineReasonLines(reason: EngineNotInPoolReason): I18nText[] {
  if (reason.code === "eligibility") {
    const failures = reason.failures ?? [];
    return failures.length > 0 ? failures.map(describeEligibilityFailure) : [{ key: "tutorials.engine.stage.failed_eligibility" }];
  }
  return REASONS.has(reason.code) ? [{ key: `tutorials.engine.reason.${reason.code}` }] : [OTHER];
}

/** A verdict's lines: a `not_in_pool` one line per reason (at least one), any other stage its line. */
export function engineVerdictLines(verdict: Pick<EngineVerdict, "stage" | "reasons">): I18nText[] {
  if (verdict.stage === "not_in_pool") {
    const lines = (verdict.reasons ?? []).flatMap(engineReasonLines);
    return lines.length > 0 ? lines : [OTHER];
  }
  return [engineStageLine(verdict.stage)];
}
