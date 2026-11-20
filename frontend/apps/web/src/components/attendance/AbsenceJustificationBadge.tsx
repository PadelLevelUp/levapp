import { useTranslation } from "react-i18next";
import { presenceMarkTone } from "@levelup/config";
import type { AbsenceSession, AttendanceSession } from "@/types";

/**
 * Justified / unjustified, per absence row (attendance.absences rules 8, 14; PAD-441: the
 * attendance colours, amber and red). Presentational only — it never filters the list, because
 * the dashboard "Missed" KPI counts both. Shared by the absences page and the player card's
 * Assiduidade block (PAD-834).
 */
export function AbsenceJustificationBadge({ session }: { session: AttendanceSession }) {
  const { t } = useTranslation();
  const justification = (session as AbsenceSession).justification;
  if (!justification) return null;
  const justified = justification === "justified";
  return (
    <span
      data-testid="absences-justification"
      data-justification={justification}
      data-tone={presenceMarkTone(justified ? "justified" : "unjustified")}
      className={
        justified
          ? "shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning-strong"
          : "shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive"
      }
    >
      {justified ? t("absences.justified") : t("absences.unjustified")}
    </span>
  );
}
