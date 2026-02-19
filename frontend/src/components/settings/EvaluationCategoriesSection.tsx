import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { GripVertical, Plus, Trash2, ClipboardList } from "lucide-react";
import type { EvaluationCategory } from "@/types";
import { getEvaluationCategories } from "@/api/evaluation";
import { USE_MOCK_DATA } from "@/config";
import { api } from "@/api/client";

interface CategoryDraft {
  id: string;
  name: string;
  scaleMin: number;
  scaleMax: number;
  isNew?: boolean;
}

export function EvaluationCategoriesSection() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<CategoryDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  useEffect(() => {
    getEvaluationCategories()
      .then((data) =>
        setCategories(
          data.map((c) => ({ id: c.id, name: c.name, scaleMin: c.scaleMin, scaleMax: c.scaleMax }))
        )
      )
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = () => {
    setCategories((prev) => [
      ...prev,
      { id: `new-${Date.now()}`, name: "", scaleMin: 0, scaleMax: 10, isNew: true },
    ]);
  };

  const handleRemove = (id: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== id));
  };

  const handleChange = (id: string, field: keyof Omit<CategoryDraft, "id" | "isNew">, value: string | number) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    );
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);

  const handleDragOver = useCallback(
    (e: React.DragEvent, overIdx: number) => {
      e.preventDefault();
      if (dragIdx === null || dragIdx === overIdx) return;
      setCategories((prev) => {
        const next = [...prev];
        const [moved] = next.splice(dragIdx, 1);
        next.splice(overIdx, 0, moved);
        return next;
      });
      setDragIdx(overIdx);
    },
    [dragIdx]
  );

  const handleDragEnd = () => setDragIdx(null);

  const handleSave = async () => {
    const invalid = categories.some((c) => !c.name.trim() || c.scaleMin >= c.scaleMax);
    if (invalid) {
      toast({ title: "Validation error", description: "All categories need a name and min must be less than max." });
      return;
    }

    if (USE_MOCK_DATA) {
      toast({ title: "Categories saved", description: `${categories.length} categories updated (mock).` });
      return;
    }

    const payload = categories.map((c) => ({
      name: c.name,
      scaleMin: c.scaleMin,
      scaleMax: c.scaleMax,
    }));
    await api.post("/app/evaluation_categories", payload);
    toast({ title: "Categories saved", description: `${categories.length} categories updated.` });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Loading categories…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4" />
          Evaluation Categories
        </CardTitle>
        <CardDescription>
          Define the categories used to evaluate players. Drag to reorder.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Header row */}
        <div className="grid grid-cols-[32px_1fr_64px_64px_32px] gap-2 text-xs font-medium text-muted-foreground px-1">
          <span />
          <span>Name</span>
          <span>Min</span>
          <span>Max</span>
          <span />
        </div>

        {categories.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No categories defined yet. Add your first one below.
          </p>
        )}

        {categories.map((cat, idx) => (
          <div
            key={cat.id}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragEnd={handleDragEnd}
            className={`grid grid-cols-[32px_1fr_64px_64px_32px] gap-2 items-center rounded-lg border p-2 transition-colors ${
              dragIdx === idx ? "bg-muted/50 border-primary/30" : "bg-background"
            }`}
          >
            <button
              type="button"
              className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
              aria-label="Drag to reorder"
            >
              <GripVertical className="w-4 h-4" />
            </button>

            <Input
              value={cat.name}
              onChange={(e) => handleChange(cat.id, "name", e.target.value)}
              placeholder="Technique"
              className="h-8 text-sm"
            />

            <Input
              type="number"
              value={cat.scaleMin}
              onChange={(e) => handleChange(cat.id, "scaleMin", Number(e.target.value))}
              className="h-8 text-sm"
            />

            <Input
              type="number"
              value={cat.scaleMax}
              onChange={(e) => handleChange(cat.id, "scaleMax", Number(e.target.value))}
              className="h-8 text-sm"
            />

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => handleRemove(cat.id)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}

        <Separator />

        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={handleAdd} className="gap-2">
            <Plus className="w-4 h-4" />
            Add category
          </Button>

          <Button size="sm" onClick={handleSave}>
            Save categories
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
