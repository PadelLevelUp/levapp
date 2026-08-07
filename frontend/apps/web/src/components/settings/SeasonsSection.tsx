import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, CalendarRange } from "lucide-react";
import type { Season } from "@/types";
import { getSeasons, addSeasons, deleteSeason, type SeasonUpsert } from "@/api/seasons";
import { USE_MOCK_DATA } from "@/config";

interface SeasonDraft {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isNew?: boolean;
}

export function SeasonsSection() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [seasons, setSeasons] = useState<SeasonDraft[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    getSeasons()
      .then((data) =>
        setSeasons(
          data.map((s) => ({
            id: s.id,
            name: s.name,
            startDate: s.startDate,
            endDate: s.endDate,
          }))
        )
      )
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = () => {
    setSeasons((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        name: "",
        startDate: "",
        endDate: "",
        isNew: true,
      },
    ]);
  };

  const handleRemove = async (id: string) => {
    const season = seasons.find((s) => s.id === id);
    if (season?.isNew) {
      setSeasons((prev) => prev.filter((s) => s.id !== id));
      return;
    }
    setRemovingId(id);
    try {
      await deleteSeason(id);
      setSeasons((prev) => prev.filter((s) => s.id !== id));
    } catch {
      toast({ variant: "destructive", title: t("settings.seasons.deleteFailed") });
    } finally {
      setRemovingId(null);
    }
  };

  const handleChange = (
    id: string,
    field: "name" | "startDate" | "endDate",
    value: string
  ) => {
    setSeasons((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  const handleSave = async () => {
    const invalid = seasons.some(
      (s) => !s.name.trim() || !s.startDate || !s.endDate || s.startDate > s.endDate
    );
    if (invalid) {
      toast({
        variant: "destructive",
        title: t("settings.seasons.validationErrorTitle"),
        description: t("settings.seasons.validationErrorDescription"),
      });
      return;
    }

    // PAD-89: send `id` for already-persisted rows so the backend updates them
    // in place. Locally-added rows carry a synthetic `new-<ts>` id and must be
    // posted without one so the backend creates them.
    const payload: SeasonUpsert[] = seasons.map((s) => ({
      ...(s.isNew ? {} : { id: s.id }),
      name: s.name,
      startDate: s.startDate,
      endDate: s.endDate,
    }));

    if (USE_MOCK_DATA) {
      toast({
        title: t("settings.seasons.savedTitle"),
        description: t("settings.seasons.savedMock", { count: seasons.length }),
      });
      return;
    }

    setSaving(true);
    try {
      const updated = await addSeasons(payload);
      setSeasons(
        updated.map((s) => ({
          id: s.id,
          name: s.name,
          startDate: s.startDate,
          endDate: s.endDate,
        }))
      );
      toast({
        title: t("settings.seasons.savedTitle"),
        description: t("settings.seasons.saved", { count: updated.length }),
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: t("settings.seasons.saveFailed"),
        description: err?.response?.data?.error || t("settings.seasons.saveFailed"),
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {t("settings.seasons.loading")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarRange className="w-4 h-4" />
          {t("settings.seasons.title")}
        </CardTitle>
        <CardDescription>
          {t("settings.seasons.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Header row */}
        <div className="hidden grid-cols-1 sm:grid-cols-[1fr_150px_150px_32px] gap-2 text-xs font-medium text-muted-foreground px-1 sm:grid">
          <span>{t("settings.seasons.name")}</span>
          <span>{t("settings.seasons.start")}</span>
          <span>{t("settings.seasons.end")}</span>
          <span />
        </div>

        {seasons.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t("settings.seasons.empty")}
          </p>
        )}

        {seasons.map((season) => (
          <div
            key={season.id}
            className="grid grid-cols-1 sm:grid-cols-[1fr_150px_150px_32px] gap-2 items-center rounded-lg border p-2 bg-background"
          >
            <Input
              value={season.name}
              onChange={(e) => handleChange(season.id, "name", e.target.value)}
              placeholder={t("settings.seasons.namePlaceholder")}
              className="h-8 text-sm"
            />

            <Input
              type="date"
              aria-label={t("settings.seasons.startAriaLabel")}
              value={season.startDate}
              onChange={(e) => handleChange(season.id, "startDate", e.target.value)}
              className="h-8 text-sm"
            />

            <Input
              type="date"
              aria-label={t("settings.seasons.endAriaLabel")}
              value={season.endDate}
              onChange={(e) => handleChange(season.id, "endDate", e.target.value)}
              className="h-8 text-sm"
            />

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => handleRemove(season.id)}
              disabled={removingId === season.id}
            >
              {removingId === season.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </Button>
          </div>
        ))}

        <Separator />

        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={handleAdd} className="gap-2">
            <Plus className="w-4 h-4" />
            {t("settings.seasons.addSeason")}
          </Button>

          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? t("settings.seasons.saving") : t("settings.seasons.saveSeasons")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
