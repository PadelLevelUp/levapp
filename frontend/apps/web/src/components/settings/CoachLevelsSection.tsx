import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, GripVertical, Loader2, Plus, Trash2, GraduationCap } from "lucide-react";
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

  // Maps the server's coach levels into local draft rows, keyed by their real
  // numeric id. Shared by the initial load and the post-save refresh so a saved
  // row never keeps its temporary `new-…` id (PAD-101).
  const toDrafts = (data: CoachLevel[]): LevelDraft[] =>
    data
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((l) => ({ id: l.id, code: l.code, label: l.label }));

  useEffect(() => {
    getCoachLevels()
      .then((data) => setLevels(toDrafts(data)))
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
      // Re-key local rows with the server-returned ids. The save endpoint upserts
      // and does not echo ids back, so refetch the persisted ladder — otherwise a
      // just-added row keeps its temp `new-…` id and deleting it before a reload
      // sends that non-numeric id to the delete endpoint (PAD-101).
      setLevels(toDrafts(await getCoachLevels()));
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
        <div className="hidden grid-cols-[32px_1fr_auto] sm:grid-cols-[32px_80px_1fr_64px_32px] gap-2 text-xs font-medium text-muted-foreground px-1 sm:grid">
          <span />
          <span>{t("settings.coachLevels.code")}</span>
          <span>{t("settings.coachLevels.label")}</span>
          <span />
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
            data-testid="coach-level-row"
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragEnd={handleDragEnd}
            className={`flex flex-wrap sm:grid sm:grid-cols-[32px_80px_1fr_64px_32px] gap-2 items-center rounded-lg border p-2 transition-colors ${
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

            {/* Code is short ("I1") but must not be squeezed to nothing; the
                label is the flexible one. `sm:contents` keeps the desktop grid
                seeing the Input directly. */}
            <div className="flex items-center gap-1.5 sm:contents">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground sm:hidden">
                {t("settings.coachLevels.code")}
              </span>
              <Input
                value={level.code}
                aria-label={t("settings.coachLevels.code")}
                onChange={(e) => handleChange(level.id, "code", e.target.value)}
                placeholder={t("settings.coachLevels.codePlaceholder")}
                className="h-8 w-16 text-sm sm:w-auto"
              />
            </div>

            <div className="order-4 flex flex-1 items-center gap-1.5 sm:order-none sm:contents">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground sm:hidden">
                {t("settings.coachLevels.label")}
              </span>
              <Input
                value={level.label}
                aria-label={t("settings.coachLevels.label")}
                onChange={(e) => handleChange(level.id, "label", e.target.value)}
                placeholder={t("settings.coachLevels.labelPlaceholder")}
                className="h-8 text-sm min-w-[6rem] flex-1"
              />
            </div>

            {/* PAD-84: the list order carries meaning (position 1 => lowest
                displayOrder => strongest level, per the notification engine's
                "one level above" matching), but nothing on screen said so. The
                two end markers name the ends; the rule + chevron running down
                the same column show the direction between them. The rail is
                purely decorative (aria-hidden) — the markers carry the meaning
                for screen readers. Markers only make sense with 2+ levels,
                otherwise the single level would be both ends at once. */}
            {levels.length > 1 && idx === 0 ? (
              <span className="order-3 flex shrink-0 flex-col items-center gap-1 sm:order-none">
                <span
                  data-testid="coach-level-highest-marker"
                  className="text-center text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground"
                >
                  {t("settings.coachLevels.highestLevel")}
                </span>
                <span aria-hidden="true" className="h-2 w-px bg-border" />
              </span>
            ) : levels.length > 1 && idx === levels.length - 1 ? (
              <span className="order-3 flex shrink-0 flex-col items-center sm:order-none">
                <ChevronDown
                  data-testid="coach-level-direction-arrow"
                  aria-hidden="true"
                  className="w-3.5 h-3.5 text-muted-foreground"
                />
                <span
                  data-testid="coach-level-lowest-marker"
                  className="text-center text-[10px] font-medium uppercase leading-tight tracking-wide text-muted-foreground"
                >
                  {t("settings.coachLevels.lowestLevel")}
                </span>
              </span>
            ) : levels.length > 1 ? (
              <span aria-hidden="true" className="mx-auto block h-5 w-px bg-border" />
            ) : (
              <span />
            )}

            <Button
              variant="ghost"
              size="icon"
              className="order-5 h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive ml-auto sm:order-none sm:ml-0"
              onClick={() => handleRemove(level.id)}
              disabled={removingId === level.id}
            >
              {removingId === level.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </Button>
          </div>
        ))}

        <Separator />

        <div className="flex flex-wrap items-center justify-between gap-2">
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
