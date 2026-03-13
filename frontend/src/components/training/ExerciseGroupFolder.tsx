import { useState } from "react";
import { ChevronRight, FolderOpen, Folder, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExerciseCard } from "@/components/training/ExerciseCard";
import { cn } from "@/lib/utils";
import type { Exercise, ExerciseGroup } from "@/types/training";

interface Props {
  group: ExerciseGroup;
  exercises: Exercise[];
  onEditGroup: () => void;
  onDeleteGroup: () => void;
  onEditExercise: (ex: Exercise) => void;
  onDeleteExercise: (id: string) => void;
}

export function ExerciseGroupFolder({
  group,
  exercises,
  onEditGroup,
  onDeleteGroup,
  onEditExercise,
  onDeleteExercise,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const groupExercises = exercises.filter((ex) => group.exerciseIds.includes(ex.id));

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left group/folder"
        onClick={() => setExpanded(!expanded)}
      >
        <ChevronRight
          className={cn(
            "w-4 h-4 text-muted-foreground transition-transform shrink-0",
            expanded && "rotate-90"
          )}
        />
        {expanded ? (
          <FolderOpen className="w-5 h-5 text-primary shrink-0" />
        ) : (
          <Folder className="w-5 h-5 text-primary shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm truncate">{group.name}</span>
            <Badge variant="secondary" className="text-[10px] shrink-0">
              {groupExercises.length} exercise{groupExercises.length !== 1 ? "s" : ""}
            </Badge>
          </div>
          {group.description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{group.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover/folder:opacity-100 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              onEditGroup();
            }}
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteGroup();
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-1">
          {groupExercises.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No exercises in this group yet.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {groupExercises.map((ex) => (
                <ExerciseCard
                  key={ex.id}
                  exercise={ex}
                  onClick={() => onEditExercise(ex)}
                  onDelete={() => onDeleteExercise(ex.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
