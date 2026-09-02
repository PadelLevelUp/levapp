import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import type { Exercise } from "@/types/training";

const diffColor = (d: number) => {
  if (d <= 2) return "bg-success/15 text-success-strong border-success/30";
  if (d <= 3) return "bg-warning/15 text-warning-strong border-warning/30";
  return "bg-destructive/15 text-destructive border-destructive/30";
};

interface Props {
  exercise: Exercise;
  onClick: () => void;
  onDelete: () => void;
}

export function ExerciseCard({ exercise: ex, onClick, onDelete }: Props) {
  const { t } = useTranslation();
  const typeLabel = (type: string) => t(`training.exerciseType.${type}`, { defaultValue: type });
  const diffLabel = (d: number) => t(`training.difficulty.${d}`, { defaultValue: String(d) });
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow group"
      onClick={onClick}
    >
      <CardContent className="p-4 space-y-2">
        {ex.diagram && ex.diagram.elements.length > 0 && (
          <div className="h-24 bg-success/80 rounded overflow-hidden mb-2">
            <svg viewBox="0 0 280 520" className="w-full h-full">
              <rect x="20" y="20" width="240" height="480" fill="#1a6b35" stroke="white" strokeWidth="2" rx="2" />
              <line x1="20" y1="260" x2="260" y2="260" stroke="white" strokeWidth="2" />
              {ex.diagram.elements.slice(0, 15).map((el) => {
                const color = el.type.startsWith("player_") || el.type === "coach"
                  ? (({ player_1: "#3b82f6", player_2: "#ef4444", player_3: "#22c55e", player_4: "#a855f7", coach: "#f59e0b" } as any)[el.type] || "#3b82f6")
                  : undefined;
                if (color) return <circle key={el.id} cx={el.x} cy={el.y} r="8" fill={color} />;
                if (el.type === "cone") return <polygon key={el.id} points={`${el.x},${el.y - 6} ${el.x - 5},${el.y + 4} ${el.x + 5},${el.y + 4}`} fill="#f97316" />;
                if (el.type === "ball") return <circle key={el.id} cx={el.x} cy={el.y} r="4" fill="#facc15" />;
                if ((el.type === "arrow" || el.type === "movement") && el.endX != null) {
                  return <line key={el.id} x1={el.x} y1={el.y} x2={el.endX} y2={el.endY} stroke="white" strokeWidth="1.5" opacity="0.7" />;
                }
                return null;
              })}
            </svg>
          </div>
        )}

        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm leading-tight">{ex.name}</h3>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("training.card.deleteExercise")}
            className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>

        {ex.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{ex.description}</p>
        )}

        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="secondary" className="text-[10px]">{typeLabel(ex.type)}</Badge>
          <Badge variant="outline" className={`text-[10px] ${diffColor(ex.difficulty)}`}>
            {diffLabel(ex.difficulty)}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
