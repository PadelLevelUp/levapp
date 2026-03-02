import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CourtDiagramEditor } from "@/components/training/CourtDiagramEditor";
import { EXERCISE_TYPE_OPTIONS, DIFFICULTY_OPTIONS } from "@/types/training";
import type { ExercisePayload, CourtDiagram, Exercise, Difficulty, ExerciseType } from "@/types/training";
import { getCoachLevels } from "@/api/coachLevel";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercise?: Exercise | null;
  onSubmit: (data: ExercisePayload) => void;
  loading?: boolean;
}

const emptyDiagram: CourtDiagram = { elements: [] };

export function ExerciseFormSheet({ open, onOpenChange, exercise, onSubmit, loading }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<ExerciseType>("attack");
  const [customType, setCustomType] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>(1);
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [diagram, setDiagram] = useState<CourtDiagram>(emptyDiagram);
  const [notes, setNotes] = useState("");

  const { data: levels = [] } = useQuery({
    queryKey: ["coach_levels"],
    queryFn: getCoachLevels,
  });

  useEffect(() => {
    if (exercise) {
      setName(exercise.name);
      setDescription(exercise.description || "");
      setType(exercise.type);
      setCustomType(exercise.customType || "");
      setDifficulty(exercise.difficulty);
      setSelectedLevels(exercise.levelIds);
      setDiagram(exercise.diagram || emptyDiagram);
      setNotes(exercise.notes || "");
    } else {
      setName("");
      setDescription("");
      setType("attack");
      setCustomType("");
      setDifficulty(1);
      setSelectedLevels([]);
      setDiagram(emptyDiagram);
      setNotes("");
    }
  }, [exercise, open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name,
      description: description || undefined,
      type,
      customType: type === "custom" ? customType : undefined,
      difficulty,
      levelIds: selectedLevels,
      diagram: diagram.elements.length > 0 ? diagram : undefined,
      notes: notes || undefined,
    });
  }

  function toggleLevel(id: string) {
    setSelectedLevels((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{exercise ? "Edit Exercise" : "New Exercise"}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-4">
          <div className="space-y-1.5">
            <Label htmlFor="ex-name">Name *</Label>
            <Input id="ex-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cross-court bandeja" required />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ex-desc">Description</Label>
            <Textarea id="ex-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the exercise..." rows={3} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type *</Label>
              <Select value={type} onValueChange={(v) => setType(v as ExerciseType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXERCISE_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {type === "custom" && (
              <div className="space-y-1.5">
                <Label htmlFor="ex-custom-type">Custom type</Label>
                <Input id="ex-custom-type" value={customType} onChange={(e) => setCustomType(e.target.value)} placeholder="e.g. Tactics" />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Difficulty *</Label>
              <Select value={String(difficulty)} onValueChange={(v) => setDifficulty(Number(v) as Difficulty)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIFFICULTY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {levels.length > 0 && (
            <div className="space-y-1.5">
              <Label>Levels</Label>
              <div className="flex flex-wrap gap-1.5">
                {levels.map((level) => {
                  const isSelected = selectedLevels.includes(level.id);
                  return (
                    <Badge
                      key={level.id}
                      variant={isSelected ? "default" : "outline"}
                      className="cursor-pointer select-none"
                      onClick={() => toggleLevel(level.id)}
                    >
                      {level.label}
                      {isSelected && <X className="w-3 h-3 ml-1" />}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          <CourtDiagramEditor value={diagram} onChange={setDiagram} />

          <div className="space-y-1.5">
            <Label htmlFor="ex-notes">Additional notes</Label>
            <Textarea id="ex-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Variations, key points..." rows={2} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || loading}>
              {loading ? "Saving..." : exercise ? "Save Changes" : "Create Exercise"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
