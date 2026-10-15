import { useTranslation } from "react-i18next";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/**
 * PAD-551 (`classes.instance-enrollment` rule 13): a player's side in one occurrence, for the
 * coach — the tag "Esquerdo/Direito nesta aula" when set here, and the control "Lado nesta aula:
 * Habitual / Esquerdo / Direito" while the server says it may still change. One component for the
 * attendance rows and the participant popup, so the two cannot drift.
 */
export interface SideInOccurrence {
  /** The side the server reports for this occurrence (override, else the usual side). */
  current: "left" | "right" | "both" | null;
  /** Whether this occurrence sets it. */
  override: boolean;
  /** The server's answer: not ended, not canceled. */
  editable: boolean;
  busy?: boolean;
  /** `null` goes back to the usual side. */
  onChange: (side: "left" | "right" | null) => void;
}

export function SideInOccurrenceControl({ playerId, side }: { playerId: string; side: SideInOccurrence }) {
  const { t } = useTranslation();
  return (
    <>
      {side.override && (side.current === "left" || side.current === "right") && (
        <p data-testid={`participant-side-${playerId}`} className="text-xs font-medium text-foreground">
          {t(`calendar.side.tag.${side.current}`)}
        </p>
      )}
      {side.editable && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t("calendar.side.label")}</span>
          <ToggleGroup
            type="single"
            size="sm"
            value={side.override && side.current ? side.current : "usual"}
            // Radix reports "" when the pressed item is pressed again: one choice is always on.
            onValueChange={(v) => {
              if (v === "usual") side.onChange(null);
              else if (v === "left" || v === "right") side.onChange(v);
            }}
            disabled={side.busy}
            aria-label={t("calendar.side.label")}
            className="justify-start"
          >
            {(["usual", "left", "right"] as const).map((v) => (
              <ToggleGroupItem
                key={v}
                value={v}
                data-testid={`participant-side-${v}-${playerId}`}
                className="h-8 px-2 text-xs"
              >
                {t(`calendar.side.${v}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}
    </>
  );
}
