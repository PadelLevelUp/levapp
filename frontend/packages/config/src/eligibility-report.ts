import type {
  EligibilityCheckEntry,
  EligibilityImpactEntry,
} from "@levelup/types";
import { describeEligibilityFailure, type I18nText } from "./invite-simulation";

/**
 * PAD-150 — the two coach-facing eligibility reports, shaped for rendering.
 *
 * Both shells render the manual-add confirmation (`eligibility.enforcement`
 * rule 7d) and the stricter-bar note (rule 9b) from these, so the wording and
 * grouping cannot drift between web and iOS. Reasons go through the same
 * `describeEligibilityFailure` the invite tutorial uses.
 */

export interface StudentReasons {
  playerId: number;
  name: string;
  reasons: I18nText[];
}

/** One block per failing student, one line per failed rule (rule 7). */
export function describeIneligible(entries: EligibilityCheckEntry[]): StudentReasons[] {
  return entries.map((e) => ({
    playerId: e.playerId,
    name: e.name ?? "",
    reasons: e.failures.map(describeEligibilityFailure),
  }));
}

export interface ImpactLine {
  playerId: number;
  name: string;
  instanceId: number;
  classTitle: string;
  /** Naive-UTC ISO start, formatted by the shell in the active locale. */
  startDatetime: string | null;
  reasons: I18nText[];
}

/**
 * The stricter-bar note, one line per (student, class) — the server already
 * reports per class because eligibility is relative to the class's level.
 * Sorted by class start then name so the note reads as a schedule.
 */
export function describeImpact(affected: EligibilityImpactEntry[]): ImpactLine[] {
  return [...affected]
    .sort(
      (a, b) =>
        String(a.startDatetime ?? "").localeCompare(String(b.startDatetime ?? "")) ||
        String(a.name ?? "").localeCompare(String(b.name ?? ""))
    )
    .map((e) => ({
      playerId: e.playerId,
      name: e.name ?? "",
      instanceId: e.instanceId,
      classTitle: e.classTitle ?? "",
      startDatetime: e.startDatetime,
      reasons: e.failures.map(describeEligibilityFailure),
    }));
}

/** How many distinct students the note is about (the headline number). */
export function impactStudentCount(affected: EligibilityImpactEntry[]): number {
  return new Set(affected.map((e) => e.playerId)).size;
}
