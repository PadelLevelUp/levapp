import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2, CalendarRange } from "lucide-react";
import { clubTodayISO, nextSeasonOccurrence, seasonOccurrenceContaining } from "@levelup/config";
import type { SeasonDefinition } from "@/types";
import { deleteSeason, getSeason, saveSeason } from "@/api/seasons";

/**
 * calendar.seasons rule 12 (PAD-82) — Settings → Calendar: the coach's ONE
 * recurring season, a day/month start and end (no year). The preview line is
 * derived client-side with the same maths the server uses (rule 4), so what
 * the coach reads before saving is what "until season end" will resolve to.
 */

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

type ApiError = { response?: { status?: number; data?: { error?: string; code?: string } } };

interface Draft {
  label: string;
  startDay: number;
  startMonth: number;
  endDay: number;
  endMonth: number;
}

const DEFAULT_DRAFT: Draft = { label: "", startDay: 1, startMonth: 9, endDay: 31, endMonth: 7 };

function draftFrom(definition: SeasonDefinition | null): Draft {
  if (!definition) return DEFAULT_DRAFT;
  return {
    label: definition.label ?? "",
    startDay: definition.startDay,
    startMonth: definition.startMonth,
    endDay: definition.endDay,
    endMonth: definition.endMonth,
  };
}

/** Day-of-month validity for the picked month, 29 Feb allowed (it clamps). */
function dayFitsMonth(day: number, month: number): boolean {
  return day <= new Date(Date.UTC(2024, month, 0)).getUTCDate();
}

export function SeasonsSection() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();

  const [definition, setDefinition] = useState<SeasonDefinition | null>(null);
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSeason()
      .then((data) => {
        setDefinition(data);
        setDraft(draftFrom(data));
        setEditing(Boolean(data));
      })
      .catch(() => setError(t("settings.seasons.saveFailed")))
      .finally(() => setLoading(false));
  }, [t]);

  const monthName = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(i18n.language, { month: "long", timeZone: "UTC" });
    return (month: number) => fmt.format(new Date(Date.UTC(2024, month - 1, 1)));
  }, [i18n.language]);

  const formatDay = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(i18n.language, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    return (iso: string) => fmt.format(new Date(`${iso}T00:00:00Z`));
  }, [i18n.language]);

  // Rule 12: the preview reads the current-or-upcoming occurrence of the DRAFT,
  // so the coach sees the dates change as they pick.
  const preview = useMemo(() => {
    const today = clubTodayISO(); // B-060: the club's date
    const current = seasonOccurrenceContaining(today, draft);
    if (current) return { key: "settings.seasons.previewCurrent", ...current };
    const upcoming = nextSeasonOccurrence(today, draft);
    return upcoming ? { key: "settings.seasons.previewUpcoming", ...upcoming } : null;
  }, [draft]);

  const localProblem = (): string | null => {
    if (!dayFitsMonth(draft.startDay, draft.startMonth) || !dayFitsMonth(draft.endDay, draft.endMonth)) {
      return t("settings.seasons.invalidDay");
    }
    if (draft.startDay === draft.endDay && draft.startMonth === draft.endMonth) {
      return t("settings.seasons.invalidSame");
    }
    return null;
  };

  const handleSave = async () => {
    const problem = localProblem();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await saveSeason({
        label: draft.label.trim() || null,
        startDay: draft.startDay,
        startMonth: draft.startMonth,
        endDay: draft.endDay,
        endMonth: draft.endMonth,
      });
      setDefinition(saved);
      setDraft(draftFrom(saved));
      setEditing(true);
      toast({ title: t("settings.seasons.saved") });
    } catch (err) {
      const data = (err as ApiError).response?.data;
      if ((err as ApiError).response?.status === 400 && data?.code === "invalid_season") {
        setError(t("settings.seasons.invalidDay"));
      } else {
        setError(t("settings.seasons.saveFailed"));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await deleteSeason();
      setDefinition(null);
      setDraft(DEFAULT_DRAFT);
      setEditing(false);
      setError(null);
      toast({ title: t("settings.seasons.removed") });
    } catch {
      toast({ variant: "destructive", title: t("settings.seasons.deleteFailed") });
    } finally {
      setRemoving(false);
      setConfirmOpen(false);
    }
  };

  const numberSelect = (
    id: string,
    value: number,
    values: number[],
    labelOf: (n: number) => string,
    ariaLabel: string,
    onChange: (n: number) => void
  ) => (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger id={id} className="h-9 text-sm" aria-label={ariaLabel} data-testid={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {values.map((n) => (
          <SelectItem key={n} value={String(n)}>
            {labelOf(n)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">{t("settings.seasons.loading")}</CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="season-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarRange className="w-4 h-4" />
          {t("settings.seasons.title")}
        </CardTitle>
        <CardDescription>{t("settings.seasons.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!editing && !definition ? (
          <p className="text-sm text-muted-foreground" data-testid="season-empty">
            {t("settings.seasons.empty")}
          </p>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="season-label">{t("settings.seasons.label")}</Label>
          <Input
            id="season-label"
            data-testid="season-label"
            value={draft.label}
            placeholder={t("settings.seasons.labelPlaceholder")}
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            className="h-9 text-sm max-w-sm"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">{t("settings.seasons.start")}</legend>
            <div className="grid grid-cols-[5.5rem_1fr] gap-2">
              {numberSelect("season-start-day", draft.startDay, DAYS, String, t("settings.seasons.startDay"), (n) =>
                setDraft((d) => ({ ...d, startDay: n }))
              )}
              {numberSelect("season-start-month", draft.startMonth, MONTHS, monthName, t("settings.seasons.startMonth"), (n) =>
                setDraft((d) => ({ ...d, startMonth: n }))
              )}
            </div>
          </fieldset>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">{t("settings.seasons.end")}</legend>
            <div className="grid grid-cols-[5.5rem_1fr] gap-2">
              {numberSelect("season-end-day", draft.endDay, DAYS, String, t("settings.seasons.endDay"), (n) =>
                setDraft((d) => ({ ...d, endDay: n }))
              )}
              {numberSelect("season-end-month", draft.endMonth, MONTHS, monthName, t("settings.seasons.endMonth"), (n) =>
                setDraft((d) => ({ ...d, endMonth: n }))
              )}
            </div>
          </fieldset>
        </div>

        {preview ? (
          <p className="text-sm text-muted-foreground" data-testid="season-preview">
            {t(preview.key, { start: formatDay(preview.startDate), end: formatDay(preview.endDate) })}
          </p>
        ) : null}

        {error ? (
          <p className="text-sm text-destructive" role="alert" data-testid="season-error">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {definition ? (
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmOpen(true)}
              disabled={removing}
              data-testid="season-remove"
            >
              {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {t("settings.seasons.remove")}
            </Button>
          ) : (
            <span />
          )}
          <Button size="sm" onClick={handleSave} disabled={saving} data-testid="season-save">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? t("settings.seasons.saving") : t("settings.seasons.save")}
          </Button>
        </div>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("settings.seasons.removeTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("settings.seasons.removeDescription")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={removing}>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void handleRemove();
                }}
                disabled={removing}
                data-testid="season-remove-confirm"
              >
                {t("settings.seasons.removeConfirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
