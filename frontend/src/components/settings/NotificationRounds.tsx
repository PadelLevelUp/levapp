import { Minus, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NotificationRound } from "@/types";

interface NotificationRoundsProps {
  rounds: NotificationRound[];
  onChange: (rounds: NotificationRound[]) => void;
  disabled?: boolean;
}

export function NotificationRounds({ rounds, onChange, disabled }: NotificationRoundsProps) {
  const updateDuration = (id: number, delta: number) => {
    onChange(
      rounds.map((r) =>
        r.id === id
          ? { ...r, duration: Math.max(5, Math.min(60, r.duration + delta)) }
          : r
      )
    );
  };

  const removeRound = (id: number) => {
    onChange(rounds.filter((r) => r.id !== id));
  };

  const addRound = () => {
    const nextId = rounds.length > 0 ? Math.max(...rounds.map((r) => r.id)) + 1 : 1;
    onChange([...rounds, { id: nextId, duration: 10, description: "Additional group" }]);
  };

  return (
    <div className={`space-y-3 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      {rounds.map((round, idx) => (
        <div key={round.id} className="flex items-start gap-3">
          {/* Timeline indicator */}
          <div className="flex flex-col items-center shrink-0 pt-1">
            <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-semibold">
              {idx + 1}
            </div>
            {idx < rounds.length - 1 && (
              <div className="w-px h-8 bg-border mt-1" />
            )}
          </div>

          {/* Round content */}
          <div className="flex-1 rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium truncate">{round.description}</span>
              {rounds.length > 1 && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  onClick={() => removeRound(round.id)}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Wait</span>
              <Button
                variant="outline"
                size="icon"
                className="h-6 w-6"
                onClick={() => updateDuration(round.id, -5)}
                disabled={round.duration <= 5}
              >
                <Minus className="w-3 h-3" />
              </Button>
              <span className="text-sm font-semibold w-10 text-center">
                {round.duration} min
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-6 w-6"
                onClick={() => updateDuration(round.id, 5)}
                disabled={round.duration >= 60}
              >
                <Plus className="w-3 h-3" />
              </Button>
              <span className="text-xs text-muted-foreground">then next round</span>
            </div>
          </div>
        </div>
      ))}

      {rounds.length < 5 && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1 w-full"
          onClick={addRound}
          disabled={disabled}
        >
          <Plus className="w-3.5 h-3.5" />
          Add round
        </Button>
      )}
    </div>
  );
}
