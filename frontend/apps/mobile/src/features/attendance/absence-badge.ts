import type { AbsenceJustification } from "@levelup/types";

/**
 * PAD-163 — turns a session's justification into the presentational decision
 * for its row badge on the "Faltas" screen.
 *
 * Split out as a pure function (rather than inlined in JSX, as web's
 * `AbsencesPage.renderJustification` does it) so the justified/unjustified
 * mapping is testable without a renderer, matching the pattern the sibling
 * `attendance-series.ts` already set for this feature's grouping logic.
 *
 * Presentational only — it never filters the list. The dashboard "Missed" KPI
 * counts both justified and unjustified absences, and this screen's total
 * must agree with it (spec `attendance.absences` rule 3).
 */
export interface AbsenceBadge {
  justification: AbsenceJustification;
  labelKey: "absences.justified" | "absences.unjustified";
  variant: "secondary" | "destructive";
}

export function absenceBadge(
  justification: AbsenceJustification | null | undefined
): AbsenceBadge | null {
  if (!justification) return null;
  const justified = justification === "justified";
  return {
    justification,
    labelKey: justified ? "absences.justified" : "absences.unjustified",
    variant: justified ? "secondary" : "destructive",
  };
}
