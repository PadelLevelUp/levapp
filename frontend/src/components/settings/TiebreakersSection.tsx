import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { GripVertical } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { Tiebreaker } from "@/types";

export const DEFAULT_TIEBREAKERS: Tiebreaker[] = [
  { id: "unjustified_absences", label: "Fewest unjustified absences", enabled: true },
  { id: "justified_absences", label: "Most justified absences", enabled: true },
  { id: "attendance_rate", label: "Highest attendance rate", enabled: true },
  { id: "playing_side_match", label: "Matching playing side", enabled: false },
  { id: "subscription_status", label: "Active subscription", enabled: false },
];

const TIEBREAKER_LABEL_KEYS: Record<string, string> = {
  unjustified_absences: "settings.tiebreakers.fewestUnjustified",
  justified_absences: "settings.tiebreakers.mostJustified",
  attendance_rate: "settings.tiebreakers.highestAttendance",
  playing_side_match: "settings.tiebreakers.matchingSide",
  subscription_status: "settings.tiebreakers.activeSubscription",
};

interface TiebreakersSectionProps {
  tiebreakers: Tiebreaker[];
  onChange: (tiebreakers: Tiebreaker[]) => void;
  disabled?: boolean;
}

export function TiebreakersSection({ tiebreakers, onChange, disabled }: TiebreakersSectionProps) {
  const { t } = useTranslation();
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const handleDragOver = useCallback(
    (e: React.DragEvent, overIdx: number) => {
      e.preventDefault();
      if (dragIdx === null || dragIdx === overIdx) return;
      const next = [...tiebreakers];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(overIdx, 0, moved);
      onChange(next);
      setDragIdx(overIdx);
    },
    [dragIdx, tiebreakers, onChange]
  );

  const toggleEnabled = (id: string) => {
    onChange(tiebreakers.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)));
  };

  return (
    <div className={`space-y-2 ${disabled ? "opacity-40 pointer-events-none" : ""}`}>
      {tiebreakers.map((tiebreaker, idx) => (
        <div
          key={tiebreaker.id}
          draggable={!disabled}
          onDragStart={() => setDragIdx(idx)}
          onDragOver={(e) => handleDragOver(e, idx)}
          onDragEnd={() => setDragIdx(null)}
          className={`flex items-center gap-3 rounded-lg border p-2.5 transition-colors ${
            dragIdx === idx ? "bg-muted/50 border-primary/30" : "bg-background"
          } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
        >
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          >
            <GripVertical className="w-4 h-4" />
          </button>

          <span className="w-6 h-6 rounded-full bg-muted text-xs flex items-center justify-center font-semibold shrink-0">
            {idx + 1}
          </span>

          <span className="flex-1 text-sm">
            {TIEBREAKER_LABEL_KEYS[tiebreaker.id]
              ? t(TIEBREAKER_LABEL_KEYS[tiebreaker.id])
              : tiebreaker.label}
          </span>

          <Switch
            checked={tiebreaker.enabled}
            onCheckedChange={() => toggleEnabled(tiebreaker.id)}
            disabled={disabled}
          />
        </div>
      ))}
    </div>
  );
}
