import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import type { Exercise, ExerciseGroup, ExerciseGroupPayload } from "@/types/training";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group?: ExerciseGroup | null;
  exercises: Exercise[];
  onSubmit: (data: ExerciseGroupPayload) => void;
  loading?: boolean;
}

export function ExerciseGroupFormSheet({ open, onOpenChange, group, exercises, onSubmit, loading }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (group) {
      setName(group.name);
      setDescription(group.description || "");
      setSelectedIds(group.exerciseIds);
    } else {
      setName("");
      setDescription("");
      setSelectedIds([]);
    }
  }, [group, open]);

  function toggleExercise(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name,
      description: description || undefined,
      exerciseIds: selectedIds,
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{group ? "Edit Group" : "New Group"}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          <div className="space-y-1.5">
            <Label htmlFor="grp-name">Name *</Label>
            <Input
              id="grp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Attacking Training at the Net"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="grp-desc">Description</Label>
            <Textarea
              id="grp-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this group about?"
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Exercises</Label>
            {exercises.length === 0 ? (
              <p className="text-sm text-muted-foreground">No exercises created yet.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto border rounded-md p-2">
                {exercises.map((ex) => (
                  <label
                    key={ex.id}
                    className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 py-0.5"
                  >
                    <Checkbox
                      checked={selectedIds.includes(ex.id)}
                      onCheckedChange={() => toggleExercise(ex.id)}
                    />
                    <span className="text-sm">{ex.name}</span>
                  </label>
                ))}
              </div>
            )}
            {selectedIds.length > 0 && (
              <p className="text-xs text-muted-foreground">{selectedIds.length} exercise(s) selected</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || loading}>
              {loading ? "Saving..." : group ? "Save Changes" : "Create Group"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
