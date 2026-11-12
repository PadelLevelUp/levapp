import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { stepEngineSetting, type EngineSettingKey } from "@levelup/config";

/**
 * PAD-920 (notifications.config rule 20): a − value + stepper for one of the new engine's settings,
 * bounded by ENGINE_SETTING_BOUNDS (the timers from ENGINE_T_FLOOR, not maxInactiveTime's 15). Test
 * ids are `<testId>-dec|inc|value`, shared with iOS. `value` is what is shown (a null setting shows
 * its fallback); `onStep` gets the stepped value, which makes the setting explicit.
 */
export function EngineStepper({
  testId,
  boundKey,
  value,
  unit,
  onStep,
  disabled,
}: {
  testId: string;
  boundKey: EngineSettingKey;
  value: number;
  unit?: string;
  onStep: (next: number) => void;
  disabled?: boolean;
}) {
  const down = stepEngineSetting(boundKey, value, -1);
  const up = stepEngineSetting(boundKey, value, 1);
  return (
    <div className="flex items-center gap-1 shrink-0">
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7"
        data-testid={`${testId}-dec`}
        onClick={() => onStep(down)}
        disabled={disabled || down === value}
      >
        <Minus className="w-3 h-3" />
      </Button>
      <span className="text-sm font-semibold w-10 text-center" data-testid={`${testId}-value`}>
        {value}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7"
        data-testid={`${testId}-inc`}
        onClick={() => onStep(up)}
        disabled={disabled || up === value}
      >
        <Plus className="w-3 h-3" />
      </Button>
      {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
    </div>
  );
}
