import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { GripVertical, Plus, Trash2, GraduationCap } from "lucide-react";
import type { CoachLevel } from "@/types";
import { getCoachLevels } from "@/api/coachLevel";
import { USE_MOCK_DATA } from "@/config";

interface LevelDraft {
  id: string;
  code: string;
  label: string;
  isNew?: boolean;
}

export function CoachLevelsSection() {
  const { toast } = useToast();
  const [levels, setLevels] = useState<LevelDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  useEffect(() => {
    getCoachLevels()
      .then((data) =>
        setLevels(
          data
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map((l) => ({ id: l.id, code: l.code, label: l.label }))
        )
      )
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = () => {
    setLevels((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        code: "",
        label: "",
        isNew: true,
      },
    ]);
  };

  const handleRemove = (id: string) => {
    setLevels((prev) => prev.filter((l) => l.id !== id));
  };

  const handleChange = (id: string, field: "code" | "label", value: string) => {
    setLevels((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: value } : l))
    );
  };

  // Drag-and-drop reordering
  const handleDragStart = (idx: number) => {
    setDragIdx(idx);
  };

  const handleDragOver = useCallback(
    (e: React.DragEvent, overIdx: number) => {
      e.preventDefault();
      if (dragIdx === null || dragIdx === overIdx) return;
      setLevels((prev) => {
        const next = [...prev];
        const [moved] = next.splice(dragIdx, 1);
        next.splice(overIdx, 0, moved);
        return next;
      });
      setDragIdx(overIdx);
    },
    [dragIdx]
  );

  const handleDragEnd = () => {
    setDragIdx(null);
  };

  const handleSave = async () => {
    const invalid = levels.some((l) => !l.code.trim() || !l.label.trim());
    if (invalid) {
      toast({ title: "Validation error", description: "All levels need a code and label." });
      return;
    }

    if (USE_MOCK_DATA) {
      toast({ title: "Levels saved", description: `${levels.length} levels updated (mock).` });
      return;
    }

    // Real API: POST each level with displayOrder
    // const payload = levels.map((l, i) => ({ code: l.code, label: l.label, displayOrder: i + 1 }));
    // await api.post("/api/app/coach_levels/bulk", payload);
    toast({ title: "Levels saved", description: `${levels.length} levels updated.` });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Loading levels…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="w-4 h-4" />
          Coach Levels
        </CardTitle>
        <CardDescription>
          Define skill levels for your players. Drag to reorder.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Header row */}
        <div className="grid grid-cols-[32px_80px_1fr_32px] gap-2 text-xs font-medium text-muted-foreground px-1">
          <span />
          <span>Code</span>
          <span>Label</span>
          <span />
        </div>

        {levels.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No levels defined yet. Add your first one below.
          </p>
        )}

        {levels.map((level, idx) => (
          <div
            key={level.id}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragEnd={handleDragEnd}
            className={`grid grid-cols-[32px_80px_1fr_32px] gap-2 items-center rounded-lg border p-2 transition-colors ${
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
              value={level.code}
              onChange={(e) => handleChange(level.id, "code", e.target.value)}
              placeholder="L1"
              className="h-8 text-sm"
            />

            <Input
              value={level.label}
              onChange={(e) => handleChange(level.id, "label", e.target.value)}
              placeholder="Beginner"
              className="h-8 text-sm"
            />

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => handleRemove(level.id)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}

        <Separator />

        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={handleAdd} className="gap-2">
            <Plus className="w-4 h-4" />
            Add level
          </Button>

          <Button size="sm" onClick={handleSave}>
            Save levels
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
