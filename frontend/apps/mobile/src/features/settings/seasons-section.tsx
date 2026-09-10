import { Ionicons } from "@expo/vector-icons";
import { seasonsApi } from "@levelup/api";
import { lightTheme, nextSeasonOccurrence, seasonOccurrenceContaining } from "@levelup/config";
import type { SeasonDefinition } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type Option,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";

/**
 * calendar.seasons rule 12 (PAD-82) — Settings → Calendar on iOS, mirroring
 * web's SeasonsSection: the coach's ONE recurring season as a day/month start
 * and end. The preview line uses the shared occurrence maths (rule 4), so what
 * the coach reads is what "until season end" will resolve to.
 */

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

type ApiErr = { response?: { status?: number; data?: { code?: string } } };

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

function dayFitsMonth(day: number, month: number): boolean {
  return day <= new Date(Date.UTC(2024, month, 0)).getUTCDate();
}

export function SeasonsSection() {
  const { t, i18n } = useTranslation();

  const [definition, setDefinition] = React.useState<SeasonDefinition | null>(null);
  const [draft, setDraft] = React.useState<Draft>(DEFAULT_DRAFT);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    seasonsApi
      .getSeason()
      .then((data) => {
        if (cancelled) return;
        setDefinition(data);
        setDraft(draftFrom(data));
      })
      .catch(() => {
        if (!cancelled) setStatus(t("common.somethingWentWrong"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const monthName = React.useMemo(() => {
    const fmt = new Intl.DateTimeFormat(i18n.language, { month: "long", timeZone: "UTC" });
    return (month: number) => fmt.format(new Date(Date.UTC(2024, month - 1, 1)));
  }, [i18n.language]);

  const formatDay = React.useMemo(() => {
    const fmt = new Intl.DateTimeFormat(i18n.language, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
    return (iso: string) => fmt.format(new Date(`${iso}T00:00:00Z`));
  }, [i18n.language]);

  const dayOptions = React.useMemo<Option[]>(() => DAYS.map((d) => ({ value: String(d), label: String(d) })), []);
  const monthOptions = React.useMemo<Option[]>(
    () => MONTHS.map((m) => ({ value: String(m), label: monthName(m) })),
    [monthName]
  );

  const preview = React.useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
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
    setStatus(null);
    try {
      const saved = await seasonsApi.saveSeason({
        label: draft.label.trim() || null,
        startDay: draft.startDay,
        startMonth: draft.startMonth,
        endDay: draft.endDay,
        endMonth: draft.endMonth,
      });
      setDefinition(saved);
      setDraft(draftFrom(saved));
      setStatus(t("settings.seasons.saved"));
    } catch (err) {
      const e = err as ApiErr;
      setError(
        e.response?.status === 400 && e.response.data?.code === "invalid_season"
          ? t("settings.seasons.invalidDay")
          : t("settings.seasons.saveFailed")
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      await seasonsApi.deleteSeason();
      setDefinition(null);
      setDraft(DEFAULT_DRAFT);
      setError(null);
      setStatus(t("settings.seasons.removed"));
    } catch {
      setError(t("settings.seasons.deleteFailed"));
    } finally {
      setRemoving(false);
      setConfirmOpen(false);
    }
  };

  const numberSelect = (
    testID: string,
    value: number,
    options: Option[],
    accessibilityLabel: string,
    onChange: (n: number) => void
  ) => (
    <View className="flex-1">
      <Select
        value={options.find((o) => o!.value === String(value))}
        onValueChange={(option) => option && onChange(Number(option.value))}
      >
        <SelectTrigger testID={testID} accessibilityLabel={accessibilityLabel}>
          <SelectValue placeholder={accessibilityLabel} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option!.value} value={option!.value} label={option!.label} />
          ))}
        </SelectContent>
      </Select>
    </View>
  );

  return (
    <Card testID="settings-seasons">
      <CardHeader>
        <CardTitle>{t("settings.seasons.title")}</CardTitle>
        <CardDescription>{t("settings.seasons.description")}</CardDescription>
      </CardHeader>
      <CardContent className="gap-3">
        {loading ? (
          <View className="gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </View>
        ) : (
          <>
            {!definition ? (
              <Text className="text-sm text-muted-foreground" testID="season-empty">
                {t("settings.seasons.empty")}
              </Text>
            ) : null}

            <View className="gap-1.5">
              <Label>{t("settings.seasons.label")}</Label>
              <Input
                testID="season-label"
                accessibilityLabel={t("settings.seasons.label")}
                placeholder={t("settings.seasons.labelPlaceholder")}
                value={draft.label}
                onChangeText={(v) => setDraft((d) => ({ ...d, label: v }))}
              />
            </View>

            <View className="gap-1.5">
              <Label>{t("settings.seasons.start")}</Label>
              <View className="flex-row gap-2">
                {numberSelect("season-start-day", draft.startDay, dayOptions, t("settings.seasons.startDay"), (n) =>
                  setDraft((d) => ({ ...d, startDay: n }))
                )}
                {numberSelect("season-start-month", draft.startMonth, monthOptions, t("settings.seasons.startMonth"), (n) =>
                  setDraft((d) => ({ ...d, startMonth: n }))
                )}
              </View>
            </View>

            <View className="gap-1.5">
              <Label>{t("settings.seasons.end")}</Label>
              <View className="flex-row gap-2">
                {numberSelect("season-end-day", draft.endDay, dayOptions, t("settings.seasons.endDay"), (n) =>
                  setDraft((d) => ({ ...d, endDay: n }))
                )}
                {numberSelect("season-end-month", draft.endMonth, monthOptions, t("settings.seasons.endMonth"), (n) =>
                  setDraft((d) => ({ ...d, endMonth: n }))
                )}
              </View>
            </View>

            {preview ? (
              <Text className="text-sm text-muted-foreground" testID="season-preview">
                {t(preview.key, { start: formatDay(preview.startDate), end: formatDay(preview.endDate) })}
              </Text>
            ) : null}

            {error ? (
              <Text className="text-sm text-destructive" testID="season-error" accessibilityLiveRegion="polite">
                {error}
              </Text>
            ) : null}
            {status && !error ? (
              <Text className="text-sm text-muted-foreground" testID="settings-seasons-status">
                {status}
              </Text>
            ) : null}

            <View className="flex-row items-center gap-2 pt-1">
              {definition ? (
                <Pressable
                  testID="season-remove"
                  accessibilityLabel={t("settings.seasons.remove")}
                  role="button"
                  disabled={removing}
                  onPress={() => setConfirmOpen(true)}
                  className="flex-row items-center gap-1 p-2"
                >
                  {removing ? (
                    <Spinner size="small" />
                  ) : (
                    <Ionicons name="trash-outline" size={18} color={lightTheme.destructive} />
                  )}
                  <Text className="text-sm text-muted-foreground">{t("settings.seasons.remove")}</Text>
                </Pressable>
              ) : (
                <View className="flex-1" />
              )}
              <Button
                size="sm"
                className="flex-1"
                testID="season-save"
                accessibilityLabel={t("settings.seasons.save")}
                disabled={saving}
                onPress={() => void handleSave()}
              >
                <Text>{saving ? t("settings.seasons.saving") : t("settings.seasons.save")}</Text>
              </Button>
            </View>
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.seasons.removeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("settings.seasons.removeDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel accessibilityLabel={t("common.cancel")} disabled={removing}>
              <Text>{t("common.cancel")}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              testID="season-remove-confirm"
              accessibilityLabel={t("settings.seasons.removeConfirm")}
              className="bg-destructive"
              disabled={removing}
              onPress={() => void handleRemove()}
            >
              <Text>{t("settings.seasons.removeConfirm")}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
