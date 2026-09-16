/**
 * PAD-129 — the class sheet's eligibility tier (eligibility.cascade rules 7–9).
 *
 * View mode: which tier the active bar came from. Edit mode: a three-way
 * choice — standard bar (clear this tier), everyone (`[]`), custom rules (the
 * same editor Settings uses). The edit scope dialog decides series vs class.
 */
import { useTranslation } from "react-i18next";
import { ShieldCheck } from "lucide-react";
import type { GroupRule } from "@levelup/types";
import { tierMode, tierValueFor, type EligibilityTierMode } from "@levelup/config";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { EligibilitySection } from "@/components/settings/EligibilitySection";

type Tier = "instance" | "lesson" | "coach";
type VisibilityMode = "inherit" | "on" | "off";

export function ClassEligibilityBlock({
  current,
  effective,
  source,
  editing,
  onChange,
  openSpots,
  effectiveOpenSpots,
  openSpotsSource,
  onOpenSpotsChange,
}: {
  current: GroupRule[] | null;
  effective: GroupRule[] | null;
  source: Tier;
  editing: boolean;
  onChange: (rules: GroupRule[] | null) => void;
  /** PAD-130: the open-spot toggle at this tier (`null` = inherit). */
  openSpots?: boolean | null;
  effectiveOpenSpots?: boolean;
  openSpotsSource?: Tier;
  onOpenSpotsChange?: (value: boolean | null) => void;
}) {
  const { t } = useTranslation();
  const mode = tierMode(current);
  const modes: EligibilityTierMode[] = ["standard", "everyone", "custom"];
  const visibilityMode: VisibilityMode = openSpots == null ? "inherit" : openSpots ? "on" : "off";
  const visibilityModes: VisibilityMode[] = ["inherit", "on", "off"];

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2" data-testid="class-eligibility">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t("calendar.eligibility.title")}</span>
        </div>
        <Badge variant="outline" data-testid="class-eligibility-source" data-source={source}>
          {t(`calendar.eligibility.source.${source}`)}
        </Badge>
      </div>
      {editing ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t("calendar.eligibility.hint")}</p>
          <RadioGroup
            value={mode}
            onValueChange={(next) =>
              onChange(tierValueFor(next as EligibilityTierMode, current, effective))
            }
            className="flex flex-wrap gap-3"
          >
            {modes.map((m) => (
              <div key={m} className="flex items-center gap-1.5">
                <RadioGroupItem value={m} id={`class-eligibility-${m}`} data-testid={`class-eligibility-mode-${m}`} />
                <Label htmlFor={`class-eligibility-${m}`} className="text-xs">
                  {t(`calendar.eligibility.mode.${m}`)}
                </Label>
              </div>
            ))}
          </RadioGroup>
          {mode === "standard" && (
            <p className="text-xs text-muted-foreground">{t("calendar.eligibility.standardHint")}</p>
          )}
          {mode === "everyone" && (
            <p className="text-xs text-muted-foreground">{t("calendar.eligibility.everyoneHint")}</p>
          )}
          {mode === "custom" && (
            <EligibilitySection
              rules={current ?? []}
              // The editor reports an empty list as null; inside a custom tier
              // that means "everyone", which is the [] value on the wire.
              onChange={(rules) => onChange(rules ?? [])}
            />
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {(effective?.length ?? 0) === 0
            ? t("calendar.eligibility.everyoneHint")
            : t("settings.eligibility.allRulesApply")}
        </p>
      )}

      {/* PAD-130 (eligibility.open-spot-visibility rules 3, 10–11): the same
          cascade for "advertise this class's empty spots". */}
      {onOpenSpotsChange && (
        <div className="border-t pt-2 space-y-2" data-testid="class-open-spots">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium">{t("calendar.openSpot.title")}</span>
            <Badge
              variant="outline"
              data-testid="class-open-spots-source"
              data-source={openSpotsSource ?? "coach"}
              data-visible={effectiveOpenSpots ? "true" : "false"}
            >
              {t(`calendar.openSpot.source.${openSpotsSource ?? "coach"}`)} ·{" "}
              {t(effectiveOpenSpots ? "calendar.openSpot.mode.on" : "calendar.openSpot.mode.off")}
            </Badge>
          </div>
          {editing && (
            <>
              <p className="text-xs text-muted-foreground">{t("calendar.openSpot.hint")}</p>
              <RadioGroup
                value={visibilityMode}
                onValueChange={(next) =>
                  onOpenSpotsChange(next === "inherit" ? null : next === "on")
                }
                className="flex flex-wrap gap-3"
              >
                {visibilityModes.map((m) => (
                  <div key={m} className="flex items-center gap-1.5">
                    <RadioGroupItem value={m} id={`class-open-spots-${m}`} data-testid={`class-open-spots-mode-${m}`} />
                    <Label htmlFor={`class-open-spots-${m}`} className="text-xs">
                      {t(`calendar.openSpot.mode.${m}`)}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </>
          )}
        </div>
      )}
    </div>
  );
}
