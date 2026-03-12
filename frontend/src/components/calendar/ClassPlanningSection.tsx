import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, X, Dumbbell, FolderOpen, Search, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getExercises, getExerciseGroups } from "@/api/training";
import { EXERCISE_TYPE_OPTIONS, DIFFICULTY_OPTIONS } from "@/types/training";
import type { Exercise, ExerciseType } from "@/types/training";

const typeLabel = (t: ExerciseType) =>
  EXERCISE_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
const diffLabel = (d: number) =>
  DIFFICULTY_OPTIONS.find((o) => o.value === d)?.label ?? String(d);

interface Props {
  exerciseIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  isEditing: boolean;
  onEditStart: () => void;
}

export function ClassPlanningSection({ exerciseIds, onChange, disabled, isEditing, onEditStart }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data: allExercises = [] } = useQuery({
    queryKey: ["exercises"],
    queryFn: getExercises,
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["exercise-groups"],
    queryFn: getExerciseGroups,
  });

  const planned = exerciseIds
    .map((id) => allExercises.find((e) => e.id === id))
    .filter(Boolean) as Exercise[];

  const removeExercise = (id: string) => {
    onChange(exerciseIds.filter((eid) => eid !== id));
  };

  const addExercise = (id: string) => {
    if (!exerciseIds.includes(id)) {
      onChange([...exerciseIds, id]);
    }
  };

  const addGroup = (groupExerciseIds: string[]) => {
    const newIds = groupExerciseIds.filter((id) => !exerciseIds.includes(id));
    if (newIds.length > 0) {
      onChange([...exerciseIds, ...newIds]);
    }
  };

  const filteredExercises = allExercises.filter(
    (ex) => !exerciseIds.includes(ex.id) && ex.name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredGroups = groups.filter(
    (g) => g.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Dumbbell className="w-4 h-4" />
          Planning ({planned.length})
        </h4>
        {!disabled && isEditing && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => { setSearch(""); setPickerOpen(true); }}
          >
            <Plus className="w-3 h-3 mr-1" />
            Add
          </Button>
        )}
        {!disabled && !isEditing && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={onEditStart}
          >
            <Edit className="w-3 h-3 mr-1" />
            Edit
          </Button>
        )}
      </div>

      {planned.length === 0 ? (
        <p className="text-sm text-muted-foreground">No exercises planned</p>
      ) : (
        <div className="space-y-1.5">
          {planned.map((ex) => (
            <div
              key={ex.id}
              className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{ex.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Badge variant="secondary" className="text-[10px]">
                    {typeLabel(ex.type)}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {diffLabel(ex.difficulty)}
                  </Badge>
                </div>
              </div>
              {isEditing && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-destructive"
                  onClick={() => removeExercise(ex.id)}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add exercises</DialogTitle>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Tabs defaultValue="exercises" className="mt-2">
            <TabsList className="w-full">
              <TabsTrigger value="exercises" className="flex-1">
                <Dumbbell className="w-3.5 h-3.5 mr-1.5" />
                Exercises
              </TabsTrigger>
              <TabsTrigger value="groups" className="flex-1">
                <FolderOpen className="w-3.5 h-3.5 mr-1.5" />
                Groups
              </TabsTrigger>
            </TabsList>

            <TabsContent value="exercises">
              <ScrollArea className="h-64">
                {filteredExercises.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    {search ? "No exercises found" : "All exercises already added"}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {filteredExercises.map((ex) => (
                      <button
                        key={ex.id}
                        className="w-full flex items-center justify-between gap-2 p-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
                        onClick={() => { addExercise(ex.id); }}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{ex.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Badge variant="secondary" className="text-[10px]">
                              {typeLabel(ex.type)}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {diffLabel(ex.difficulty)}
                            </Badge>
                          </div>
                        </div>
                        <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="groups">
              <ScrollArea className="h-64">
                {filteredGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No groups found</p>
                ) : (
                  <div className="space-y-1">
                    {filteredGroups.map((g) => {
                      const groupExercises = allExercises.filter((ex) => g.exerciseIds.includes(ex.id));
                      const newCount = g.exerciseIds.filter((id) => !exerciseIds.includes(id)).length;

                      return (
                        <button
                          key={g.id}
                          className="w-full flex items-center justify-between gap-2 p-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
                          onClick={() => { addGroup(g.exerciseIds); }}
                          disabled={newCount === 0}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{g.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {groupExercises.length} exercise{groupExercises.length !== 1 ? "s" : ""}
                              {newCount === 0 && " · all already added"}
                            </p>
                          </div>
                          {newCount > 0 && (
                            <div className="flex items-center gap-1 text-muted-foreground shrink-0">
                              <span className="text-xs">+{newCount}</span>
                              <Plus className="w-4 h-4" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
