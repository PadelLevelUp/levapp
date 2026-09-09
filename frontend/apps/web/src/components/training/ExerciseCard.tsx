import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import type { Exercise } from "@/types/training";
import { upgradeCourtDiagram } from "@levelup/config";
import { CourtSurface } from "@/components/training/board/CourtSurface";

const diffColor = (d: number) => {
  if (d <= 2) return "bg-success/15 text-success-strong border-success/30";
  if (d <= 3) return "bg-warning/15 text-warning-strong border-warning/30";
  return "bg-destructive/15 text-destructive border-destructive/30";
};

/** Legacy diagrams count when they have elements; v2 ones when they have any piece or step. */
function hasDiagram(ex: Exercise): boolean {
  const d = ex.diagram;
  if (!d) return false;
  if ("version" in d) return d.pieces.length > 0 || d.steps.length > 0;
  return d.elements.length > 0;
}

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
        {hasDiagram(ex) && (
          <div className="mb-2 flex h-24 justify-center overflow-hidden rounded bg-[#0D1B31] p-1.5">
            <CourtSurface compact diagram={upgradeCourtDiagram(ex.diagram)} className="h-full w-auto" />
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
