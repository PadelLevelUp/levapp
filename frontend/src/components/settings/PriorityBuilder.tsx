import { useCallback, useState } from "react";
import { GripVertical, Plus, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { PriorityCriterion } from "@/types";

interface PriorityBuilderProps {
  criteria: PriorityCriterion[];
  onChange: (criteria: PriorityCriterion[]) => void;
  disabled?: boolean;
}

const ALL_CRITERIA: PriorityCriterion[] = [
  { id: "level", label: "Level", enabled: true },
  { id: "justified_misses", label: "Justified Misses", enabled: true },
  { id: "attendance", label: "Attendance", enabled: true },
  { id: "playing_side", label: "Playing Side", enabled: false },
  { id: "subscription_status", label: "Subscription Status", enabled: false },
];

export function PriorityBuilder({ criteria, onChange, disabled }: PriorityBuilderProps) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const activeIds = new Set(criteria.map((c) => c.id));
  const available = ALL_CRITERIA.filter((c) => !activeIds.has(c.id));

  const handleDragStart = (idx: number) => setDragIdx(idx);

  const handleDragOver = useCallback(
    (e: React.DragEvent, overIdx: number) => {
      e.preventDefault();
      if (dragIdx === null || dragIdx === overIdx) return;
      const next = [...criteria];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(overIdx, 0, moved);
      onChange(next);
      setDragIdx(overIdx);
    },
    [dragIdx, criteria, onChange]
  );

  const handleDragEnd = () => setDragIdx(null);

  const toggleEnabled = (id: string) => {
    onChange(criteria.map((c) => (c.id === id ? { ...c, enabled: !c.enabled } : c)));
  };

  const remove = (id: string) => {
    onChange(criteria.filter((c) => c.id !== id));
  };

  const add = (criterion: PriorityCriterion) => {
    onChange([...criteria, criterion]);
  };

  return (
    <div className="space-y-2">
      {criteria.map((criterion, idx) => (
        <div
          key={criterion.id}
          draggable={!disabled}
          onDragStart={() => handleDragStart(idx)}
          onDragOver={(e) => handleDragOver(e, idx)}
          onDragEnd={handleDragEnd}
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

          <span className="flex-1 text-sm">{criterion.label}</span>

          <Switch
            checked={criterion.enabled}
            onCheckedChange={() => toggleEnabled(criterion.id)}
            disabled={disabled}
          />

          <button
            type="button"
            className="text-muted-foreground hover:text-destructive transition-colors"
            onClick={() => remove(criterion.id)}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      {available.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {available.map((c) => (
            <Button
              key={c.id}
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              disabled={disabled}
              onClick={() => add(c)}
            >
              <Plus className="w-3 h-3" />
              {c.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
