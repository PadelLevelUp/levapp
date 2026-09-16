/**
 * PAD-150 — the stricter-bar report (eligibility.enforcement rules 9, 9a, 9b).
 *
 * Rendered from the config save response only, right under the eligibility
 * editor: a headline with the number of affected students, one line per
 * (student, class), no action button. Nobody was un-enrolled or notified.
 */
import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import type { EligibilityImpactEntry } from "@levelup/types";
import { describeImpact, formatClubDateTime, impactStudentCount, resolveText } from "@levelup/config";

export function EligibilityImpactNote({ affected }: { affected: EligibilityImpactEntry[] | null }) {
  const { t } = useTranslation();
  if (affected === null) return null;
  const count = impactStudentCount(affected);
  const lines = describeImpact(affected);

  return (
    <div
      role="status"
      data-testid="eligibility-impact"
      data-count={count}
      className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs"
    >
      <p className="flex items-center gap-2 font-medium">
        <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {count === 0
          ? t("settings.eligibility.impact.none")
          : t("settings.eligibility.impact.title", { count })}
      </p>
      {count > 0 && (
        <>
          <p className="mt-1 text-muted-foreground">{t("settings.eligibility.impact.body")}</p>
          <ul className="mt-2 space-y-1.5">
            {lines.map((l) => (
              <li key={`${l.playerId}-${l.instanceId}`} data-testid="eligibility-impact-line">
                <span className="font-medium">
                  {t("settings.eligibility.impact.line", {
                    name: l.name,
                    class: l.classTitle,
                    when: formatClubDateTime(l.startDatetime),
                  })}
                </span>
                <span className="text-muted-foreground">
                  {" — "}
                  {l.reasons.map((r) => resolveText(t, r)).join("; ")}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
