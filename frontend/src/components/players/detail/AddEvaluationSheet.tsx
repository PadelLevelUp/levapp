import { useEffect, useState } from "react";
import type { CoachNote, EvaluationCategory, PlayerEvaluation } from "@/types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { deleteCoachNote } from "@/api/players";

interface AddEvaluationSheetProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    scores: { categoryId: string; value: number }[];
    strengths: CoachNote[];
    weaknesses: CoachNote[];
  }) => void;
  categories: EvaluationCategory[];
  currentEvaluations: PlayerEvaluation[];
  currentStrengths: CoachNote[];
  currentWeaknesses: CoachNote[];
}

export function AddEvaluationSheet({
  open,
  onClose,
  onSave,
  categories,
  currentEvaluations,
  currentStrengths,
  currentWeaknesses,
}: AddEvaluationSheetProps) {
  const { toast } = useToast();

  const [scores, setScores] = useState<Record<string, number>>({});
  const [strengths, setStrengths] = useState<CoachNote[]>([]);
  const [weaknesses, setWeaknesses] = useState<CoachNote[]>([]);
  const [newStrength, setNewStrength] = useState("");
  const [newWeakness, setNewWeakness] = useState("");

  useEffect(() => {
    if (!open) return;

    // Pre-fill scores from current evaluations
    const initial: Record<string, number> = {};
    categories.forEach((cat) => {
      const existing = currentEvaluations.find(
        (e) => e.categoryName.toLowerCase() === cat.name.toLowerCase()
      );
      initial[cat.id] = existing?.score ?? Math.round((cat.scaleMin + cat.scaleMax) / 2);
    });
    setScores(initial);
    setStrengths([...currentStrengths]);
    setWeaknesses([...currentWeaknesses]);
    setNewStrength("");
    setNewWeakness("");
  }, [open, categories, currentEvaluations, currentStrengths, currentWeaknesses]);

  const handleAddStrength = () => {
    const val = newStrength.trim();
    if (!val) return;
    if (strengths.some((s) => s.text === val)) return;
    setStrengths((prev) => [...prev, { id: -Date.now(), text: val }]);
    setNewStrength("");
  };

  const handleAddWeakness = () => {
    const val = newWeakness.trim();
    if (!val) return;
    if (weaknesses.some((w) => w.text === val)) return;
    setWeaknesses((prev) => [...prev, { id: -Date.now(), text: val }]);
    setNewWeakness("");
  };

  const handleSave = () => {
    const scoreEntries = categories.map((cat) => ({
      categoryId: cat.id,
      value: scores[cat.id] ?? cat.scaleMin,
    }));

    onSave({
      scores: scoreEntries,
      strengths,
      weaknesses,
    });

    toast({ title: "Evaluation saved" });
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add Evaluation</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* CATEGORY SCORES */}
          <div className="space-y-5">
            <p className="text-sm font-medium text-muted-foreground">Scores</p>
            {categories.map((cat) => {
              const value = scores[cat.id] ?? cat.scaleMin;
              return (
                <div key={cat.id} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>{cat.name}</Label>
                    <span className="text-sm font-medium tabular-nums">
                      {value}/{cat.scaleMax}
                    </span>
                  </div>
                  <Slider
                    min={cat.scaleMin}
                    max={cat.scaleMax}
                    step={1}
                    value={[value]}
                    onValueChange={([v]) =>
                      setScores((prev) => ({ ...prev, [cat.id]: v }))
                    }
                  />
                </div>
              );
            })}
          </div>

          <Separator />

          {/* STRENGTHS */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Strengths</p>
            <div className="flex flex-wrap gap-2">
              {strengths.map((s, i) => (
                <Badge key={i} variant="secondary" className="gap-1 pr-1">
                  {s.text}
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteCoachNote(s);
                      setStrengths((prev) => prev.filter((_, idx) => idx !== i));
                    }}
                    className="ml-1 rounded-full hover:bg-muted p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add a strength..."
                value={newStrength}
                onChange={(e) => setNewStrength(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddStrength())}
                className="flex-1"
              />
              <Button variant="outline" size="icon" onClick={handleAddStrength} type="button">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Separator />

          {/* WEAKNESSES */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Weaknesses</p>
            <div className="flex flex-wrap gap-2">
              {weaknesses.map((w, i) => (
                <Badge key={i} variant="outline" className="gap-1 pr-1">
                  {w.text}
                  <button
                    type="button"
                    onClick={async () => {
                      await deleteCoachNote(w);
                      setWeaknesses((prev) => prev.filter((_, idx) => idx !== i));
                    }}
                    className="ml-1 rounded-full hover:bg-muted p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add a weakness..."
                value={newWeakness}
                onChange={(e) => setNewWeakness(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddWeakness())}
                className="flex-1"
              />
              <Button variant="outline" size="icon" onClick={handleAddWeakness} type="button">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave}>Save evaluation</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
