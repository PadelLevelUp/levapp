import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { GripVertical, Loader2, Plus, Trash2, ClipboardList } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { EvaluationCategory } from "@/types";
import type { EvaluationCategoryImpact } from "@levelup/types";
import {
  getEvaluationCategories,
  addEvaluationCategories,
  deleteEvaluationCategory,
  getEvaluationCategoryImpact,
} from "@/api/evaluation";
import { USE_MOCK_DATA } from "@/config";

interface CategoryDraft {
  id: string;
  name: string;
  scaleMin: number;
  scaleMax: number;
  isNew?: boolean;
}

export function EvaluationCategoriesSection() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [categories, setCategories] = useState<CategoryDraft[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  // evaluations.categories rule 7 (PAD-274): a saved category is deleted only
  // after the coach has seen what it holds and typed its name.
  const [pendingDelete, setPendingDelete] = useState<CategoryDraft | null>(null);
  const [impact, setImpact] = useState<EvaluationCategoryImpact | null>(null);
  const [impactFailed, setImpactFailed] = useState(false);
  const [typedName, setTypedName] = useState("");

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

  const handleRemove = (cat: CategoryDraft) => {
    // A row added in this form was never saved: there is nothing to delete.
    if (cat.isNew) {
      setCategories((prev) => prev.filter((c) => c.id !== cat.id));
      return;
    }
    setPendingDelete(cat);
    setImpact(null);
    setImpactFailed(false);
    setTypedName("");
    getEvaluationCategoryImpact(cat.id, cat.name)
      .then(setImpact)
      .catch(() => setImpactFailed(true));
  };

  const closeDelete = () => {
    if (removingId) return;
    setPendingDelete(null);
  };

  const nameMatches = impact !== null && typedName.trim() === impact.name.trim();

  const confirmDelete = async () => {
    if (!pendingDelete || !impact || !nameMatches) return;
    const { id } = pendingDelete;
    setRemovingId(id);
    try {
      await deleteEvaluationCategory(id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
      toast({ title: t("settings.evaluationCategories.deleted", { name: impact.name }) });
      setPendingDelete(null);
    } catch {
      toast({ variant: "destructive", title: t("settings.evaluationCategories.deleteFailed") });
    } finally {
      setRemovingId(null);
    }
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
      toast({ title: t("settings.evaluationCategories.validationErrorTitle"), description: t("settings.evaluationCategories.validationErrorDescription") });
      return;
    }

    if (USE_MOCK_DATA) {
      toast({ title: t("settings.evaluationCategories.savedTitle"), description: t("settings.evaluationCategories.savedMock", { count: categories.length }) });
      return;
    }

    const payload = categories.map((c) => ({
      name: c.name,
      scaleMin: c.scaleMin,
      scaleMax: c.scaleMax,
    }));
    setSaving(true);
    try {
      await addEvaluationCategories(payload);
      // Adopt the server's ids: a row saved here is no longer "new", so its
      // delete must go through the confirmation (evaluations.categories rule 7).
      const fresh = await getEvaluationCategories();
      setCategories(fresh.map((c) => ({ id: c.id, name: c.name, scaleMin: c.scaleMin, scaleMax: c.scaleMax })));
      toast({ title: t("settings.evaluationCategories.savedTitle"), description: t("settings.evaluationCategories.saved", { count: categories.length }) });
    } catch {
      toast({ variant: "destructive", title: t("settings.evaluationCategories.saveFailed") });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {t("settings.evaluationCategories.loading")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4" />
          {t("settings.evaluationCategories.title")}
        </CardTitle>
        <CardDescription>
          {t("settings.evaluationCategories.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Header row */}
        <div className="hidden grid-cols-[32px_1fr_auto] sm:grid-cols-[32px_1fr_64px_64px_32px] gap-2 text-xs font-medium text-muted-foreground px-1 sm:grid">
          <span />
          <span>{t("settings.evaluationCategories.name")}</span>
          <span>{t("settings.evaluationCategories.min")}</span>
          <span>{t("settings.evaluationCategories.max")}</span>
          <span />
        </div>

        {categories.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t("settings.evaluationCategories.empty")}
          </p>
        )}

        {categories.map((cat, idx) => (
          <div
            key={cat.id}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDragEnd={handleDragEnd}
            className={`flex flex-wrap sm:grid sm:grid-cols-[32px_1fr_64px_64px_32px] gap-2 items-center rounded-lg border p-2 transition-colors ${
              dragIdx === idx ? "bg-muted/50 border-primary/30" : "bg-background"
            }`}
          >
            <button
              type="button"
              className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
              aria-label={t("settings.evaluationCategories.dragToReorder")}
            >
              <GripVertical className="w-4 h-4" />
            </button>

            <div className="flex flex-1 items-center gap-1.5 sm:contents">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground sm:hidden">
                {t("settings.evaluationCategories.name")}
              </span>
              <Input
                value={cat.name}
                aria-label={t("settings.evaluationCategories.name")}
                onChange={(e) => handleChange(cat.id, "name", e.target.value)}
                placeholder={t("settings.evaluationCategories.namePlaceholder")}
                className="h-8 text-sm min-w-[6rem] flex-1"
              />
            </div>

            {/* The column header is hidden on mobile, so these two numbers
                would be a pair of unlabelled boxes. `sm:contents` drops the
                wrapper at `sm` so the grid still sees the Input directly. */}
            <div className="flex items-center gap-1.5 sm:contents">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground sm:hidden">
                {t("settings.evaluationCategories.min")}
              </span>
              <Input
                type="number"
                aria-label={t("settings.evaluationCategories.min")}
                value={cat.scaleMin}
                onChange={(e) => handleChange(cat.id, "scaleMin", Number(e.target.value))}
                className="h-8 w-16 text-sm sm:w-auto"
              />
            </div>

            <div className="flex items-center gap-1.5 sm:contents">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground sm:hidden">
                {t("settings.evaluationCategories.max")}
              </span>
              <Input
                type="number"
                aria-label={t("settings.evaluationCategories.max")}
                value={cat.scaleMax}
                onChange={(e) => handleChange(cat.id, "scaleMax", Number(e.target.value))}
                className="h-8 w-16 text-sm sm:w-auto"
              />
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive sm:ml-0 ml-auto"
              data-testid="evaluation-category-delete"
              aria-label={t("settings.evaluationCategories.deleteCategory", {
                name: cat.name || t("settings.evaluationCategories.name"),
              })}
              onClick={() => handleRemove(cat)}
              disabled={removingId === cat.id}
            >
              {removingId === cat.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </Button>
          </div>
        ))}

        <Separator />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={handleAdd} className="gap-2">
            <Plus className="w-4 h-4" />
            {t("settings.evaluationCategories.addCategory")}
          </Button>

          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? t("settings.evaluationCategories.saving") : t("settings.evaluationCategories.saveCategories")}
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => (open ? null : closeDelete())}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.evaluationCategories.deleteConfirmTitle", {
                name: impact?.name ?? pendingDelete?.name ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription data-testid="evaluation-category-impact">
              {impact
                ? t("settings.evaluationCategories.deleteImpact", { scores: impact.scores, players: impact.players })
                : impactFailed
                  ? t("settings.evaluationCategories.deleteImpactFailed")
                  : t("settings.evaluationCategories.deleteImpactLoading")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {impact ? (
            <div className="space-y-1.5">
              <label htmlFor="evaluation-category-delete-name" className="text-sm font-medium">
                {t("settings.evaluationCategories.typeNameToConfirm", { name: impact.name })}
              </label>
              <Input
                id="evaluation-category-delete-name"
                data-testid="evaluation-category-delete-name"
                value={typedName}
                autoComplete="off"
                onChange={(e) => setTypedName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void confirmDelete();
                }}
              />
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removingId !== null}>{t("common.cancel")}</AlertDialogCancel>
            <Button
              variant="destructive"
              data-testid="evaluation-category-delete-confirm"
              disabled={!nameMatches || removingId !== null}
              onClick={() => void confirmDelete()}
            >
              {removingId !== null ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {t("common.delete")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
