import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
          <SheetTitle>{group ? t("training.groupForm.editGroup") : t("training.groupForm.newGroup")}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          <div className="space-y-1.5">
            <Label htmlFor="grp-name">{t("training.groupForm.name")}</Label>
            <Input
              id="grp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("training.groupForm.namePlaceholder")}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="grp-desc">{t("training.groupForm.description")}</Label>
            <Textarea
              id="grp-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("training.groupForm.descriptionPlaceholder")}
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("training.groupForm.exercises")}</Label>
            {exercises.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("training.groupForm.noExercisesCreated")}</p>
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
              <p className="text-xs text-muted-foreground">{t("training.groupForm.selectedCount", { count: selectedIds.length })}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!name.trim() || loading}>
              {loading ? t("training.groupForm.saving") : group ? t("training.groupForm.saveChanges") : t("training.groupForm.createGroup")}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
