import { Minus, Plus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { NotificationRestrictions } from "@/types";

interface RestrictionRowProps {
  label: string;
  description: string;
  enabled: boolean;
  value?: number;
  unit?: string;
  min?: number;
  max?: number;
  showValue: boolean;
  disabled?: boolean;
  onToggle: () => void;
  onIncrement?: () => void;
  onDecrement?: () => void;
}

function RestrictionRow({
  label,
  description,
  enabled,
  value,
  unit,
  min,
  max,
  showValue,
  disabled,
  onToggle,
  onIncrement,
  onDecrement,
}: RestrictionRowProps) {
  return (
    <div className={`space-y-1 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {showValue && enabled && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={onDecrement}
                disabled={value !== undefined && min !== undefined && value <= min}
              >
                <Minus className="w-3 h-3" />
              </Button>
              <span className="text-sm font-semibold w-8 text-center">
                {value}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={onIncrement}
                disabled={value !== undefined && max !== undefined && value >= max}
              >
                <Plus className="w-3 h-3" />
              </Button>
              {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
            </div>
          )}
          <Switch checked={enabled} onCheckedChange={onToggle} />
        </div>
      </div>
    </div>
  );
}

interface RestrictionsPanelProps {
  restrictions: NotificationRestrictions;
  onChange: (restrictions: NotificationRestrictions) => void;
  disabled?: boolean;
}

export function RestrictionsPanel({ restrictions, onChange, disabled }: RestrictionsPanelProps) {
  const update = (key: keyof NotificationRestrictions, patch: object) => {
    onChange({ ...restrictions, [key]: { ...restrictions[key], ...patch } });
  };

  return (
    <div className="space-y-4">
      <RestrictionRow
        label="Max simultaneous notifications"
        description="How many students are notified at the same time"
        enabled={restrictions.maxSimultaneous.enabled}
        value={restrictions.maxSimultaneous.value}
        unit="students"
        min={1}
        max={20}
        showValue
        disabled={disabled}
        onToggle={() => update("maxSimultaneous", { enabled: !restrictions.maxSimultaneous.enabled })}
        onIncrement={() => update("maxSimultaneous", { value: Math.min(20, restrictions.maxSimultaneous.value + 1) })}
        onDecrement={() => update("maxSimultaneous", { value: Math.max(1, restrictions.maxSimultaneous.value - 1) })}
      />

      <RestrictionRow
        label="Max total per vacancy"
        description="Total notifications sent for one open spot"
        enabled={restrictions.maxTotal.enabled}
        value={restrictions.maxTotal.value}
        unit="total"
        min={1}
        max={50}
        showValue
        disabled={disabled}
        onToggle={() => update("maxTotal", { enabled: !restrictions.maxTotal.enabled })}
        onIncrement={() => update("maxTotal", { value: Math.min(50, restrictions.maxTotal.value + 1) })}
        onDecrement={() => update("maxTotal", { value: Math.max(1, restrictions.maxTotal.value - 1) })}
      />

      <RestrictionRow
        label="Max level deviation"
        description="Only notify students within ±N levels of the class"
        enabled={restrictions.maxLevelDeviation.enabled}
        value={restrictions.maxLevelDeviation.value}
        unit="levels"
        min={0}
        max={5}
        showValue
        disabled={disabled}
        onToggle={() => update("maxLevelDeviation", { enabled: !restrictions.maxLevelDeviation.enabled })}
        onIncrement={() => update("maxLevelDeviation", { value: Math.min(5, restrictions.maxLevelDeviation.value + 1) })}
        onDecrement={() => update("maxLevelDeviation", { value: Math.max(0, restrictions.maxLevelDeviation.value - 1) })}
      />

      <RestrictionRow
        label="Min time before class"
        description="Don't notify if class starts within X minutes"
        enabled={restrictions.minTimeBeforeClass.enabled}
        value={restrictions.minTimeBeforeClass.value}
        unit="min"
        min={5}
        max={240}
        showValue
        disabled={disabled}
        onToggle={() => update("minTimeBeforeClass", { enabled: !restrictions.minTimeBeforeClass.enabled })}
        onIncrement={() => update("minTimeBeforeClass", { value: Math.min(240, restrictions.minTimeBeforeClass.value + 5) })}
        onDecrement={() => update("minTimeBeforeClass", { value: Math.max(5, restrictions.minTimeBeforeClass.value - 5) })}
      />

      <RestrictionRow
        label="Max invitations per student / day"
        description="Prevent spam to individual students"
        enabled={restrictions.maxInvitesPerStudentPerDay.enabled}
        value={restrictions.maxInvitesPerStudentPerDay.value}
        unit="/ day"
        min={1}
        max={10}
        showValue
        disabled={disabled}
        onToggle={() => update("maxInvitesPerStudentPerDay", { enabled: !restrictions.maxInvitesPerStudentPerDay.enabled })}
        onIncrement={() => update("maxInvitesPerStudentPerDay", { value: Math.min(10, restrictions.maxInvitesPerStudentPerDay.value + 1) })}
        onDecrement={() => update("maxInvitesPerStudentPerDay", { value: Math.max(1, restrictions.maxInvitesPerStudentPerDay.value - 1) })}
      />

      <RestrictionRow
        label="Quiet hours"
        description="No notifications between 22:00 and 07:00"
        enabled={restrictions.quietHours.enabled}
        showValue={false}
        disabled={disabled}
        onToggle={() => update("quietHours", { enabled: !restrictions.quietHours.enabled })}
      />
    </div>
  );
}
