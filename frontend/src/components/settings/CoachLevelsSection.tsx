import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { GripVertical, Loader2, Plus, Trash2, GraduationCap } from "lucide-react";
import type { CoachLevel } from "@/types";
import { getCoachLevels, addCoachLevel, deleteCoachLevel } from "@/api/coachLevel";
import { USE_MOCK_DATA } from "@/config";

interface LevelDraft {
  id: string;
  code: string;
  label: string;
  isNew?: boolean;
}

export function CoachLevelsSection() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [levels, setLevels] = useState<LevelDraft[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
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

  const handleRemove = async (id: string) => {
    setRemovingId(id);
    try {
      await deleteCoachLevel(id);
      setLevels((prev) => prev.filter((l) => l.id !== id));
    } catch {
      toast({ variant: "destructive", title: t("settings.coachLevels.deleteFailed") });
    } finally {
      setRemovingId(null);
    }
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
      toast({ title: t("settings.coachLevels.validationErrorTitle"), description: t("settings.coachLevels.validationErrorDescription") });
      return;
    }

    if (USE_MOCK_DATA) {
      toast({ title: t("settings.coachLevels.savedTitle"), description: t("settings.coachLevels.savedMock", { count: levels.length }) });
      return;
    }

    const payload = levels.map((l, i) => ({ code: l.code, label: l.label, displayOrder: i + 1 }));
    setSaving(true);
    try {
      await addCoachLevel(payload);
      toast({ title: t("settings.coachLevels.savedTitle"), description: t("settings.coachLevels.saved", { count: levels.length }) });
    } catch {
      toast({ variant: "destructive", title: t("settings.coachLevels.saveFailed") });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {t("settings.coachLevels.loading")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="w-4 h-4" />
          {t("settings.coachLevels.title")}
        </CardTitle>
        <CardDescription>
          {t("settings.coachLevels.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Header row */}
        <div className="grid grid-cols-[32px_80px_1fr_32px] gap-2 text-xs font-medium text-muted-foreground px-1">
          <span />
          <span>{t("settings.coachLevels.code")}</span>
          <span>{t("settings.coachLevels.label")}</span>
          <span />
        </div>

        {levels.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t("settings.coachLevels.empty")}
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
              aria-label={t("settings.coachLevels.dragToReorder")}
            >
              <GripVertical className="w-4 h-4" />
            </button>

            <Input
              value={level.code}
              onChange={(e) => handleChange(level.id, "code", e.target.value)}
              placeholder={t("settings.coachLevels.codePlaceholder")}
              className="h-8 text-sm"
            />

            <Input
              value={level.label}
              onChange={(e) => handleChange(level.id, "label", e.target.value)}
              placeholder={t("settings.coachLevels.labelPlaceholder")}
              className="h-8 text-sm"
            />

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => handleRemove(level.id)}
              disabled={removingId === level.id}
            >
              {removingId === level.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </Button>
          </div>
        ))}

        <Separator />

        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={handleAdd} className="gap-2">
            <Plus className="w-4 h-4" />
            {t("settings.coachLevels.addLevel")}
          </Button>

          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? t("settings.coachLevels.saving") : t("settings.coachLevels.saveLevels")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
