import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import {
  addSeasons,
  deleteSeason,
  getSeasons,
  type SeasonUpsert,
} from "@/features/settings/settings-api";

interface SeasonDraft {
  id: string | number;
  name: string;
  startDate: string;
  endDate: string;
  isNew?: boolean;
}

/**
 * Seasons editor — the Calendar section, mirroring web's SeasonsSection.
 * Coach-only: every endpoint below 403s for a player, so the pane is gated
 * by `visibleSections()` in the Settings screen, not here.
 *
 * Dates use the shared `DatePickerInput` (native picker, same ""-when-unset
 * ISO contract as web's `<Input type="date">`) rather than free text.
 *
 * Layout: web packs name + two dates + delete onto one grid row; here each
 * row is a bordered block with the name and delete on line 1 and the two
 * dates stacked below, all `flex-1` — no fixed widths to overflow at 390pt.
 */
export function SeasonsSection() {
  const { t } = useTranslation();

  const [seasons, setSeasons] = React.useState<SeasonDraft[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<string | number | null>(
    null
  );
  const [status, setStatus] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    getSeasons()
      .then((data) => {
        if (cancelled) return;
        setSeasons(
          data.map((s) => ({
            id: s.id,
            name: s.name,
            startDate: s.startDate,
            endDate: s.endDate,
          }))
        );
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

  const handleChange = (
    id: string | number,
    field: "name" | "startDate" | "endDate",
    value: string
  ) => {
    setSeasons((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  const handleRemove = async (season: SeasonDraft) => {
    if (season.isNew) {
      setSeasons((prev) => prev.filter((s) => s.id !== season.id));
      return;
    }
    setRemovingId(season.id);
    try {
      await deleteSeason(season.id);
      setSeasons((prev) => prev.filter((s) => s.id !== season.id));
    } catch {
      setStatus(t("settings.seasons.deleteFailed"));
    } finally {
      setRemovingId(null);
    }
  };

  const handleSave = async () => {
    const invalid = seasons.some(
      (s) =>
        !s.name.trim() || !s.startDate || !s.endDate || s.startDate > s.endDate
    );
    if (invalid) {
      setStatus(t("settings.seasons.validationErrorDescription"));
      return;
    }

    // PAD-89: persisted rows carry their `id` so the backend updates them in
    // place; locally-added rows have a synthetic `new-<ts>` id and must be
    // posted WITHOUT one so the backend creates them.
    const payload: SeasonUpsert[] = seasons.map((s) => ({
      ...(s.isNew ? {} : { id: s.id }),
      name: s.name,
      startDate: s.startDate,
      endDate: s.endDate,
    }));

    setSaving(true);
    setStatus(null);
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
      setStatus(t("settings.seasons.saved", { count: updated.length }));
    } catch {
      setStatus(t("settings.seasons.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

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
            {seasons.length === 0 ? (
              <Text className="py-2 text-center text-sm text-muted-foreground">
                {t("settings.seasons.empty")}
              </Text>
            ) : null}

            {seasons.map((season) => (
              <View
                key={String(season.id)}
                testID="season-row"
                className="gap-2 rounded-lg border border-border p-2"
              >
                <View className="flex-row items-center gap-2">
                  <Input
                    className="flex-1"
                    accessibilityLabel={t("settings.seasons.name")}
                    placeholder={t("settings.seasons.namePlaceholder")}
                    value={season.name}
                    onChangeText={(v) => handleChange(season.id, "name", v)}
                  />
                  <Pressable
                    accessibilityLabel={t("settings.mobile.removeSeason", {
                      name: season.name || t("settings.seasons.name"),
                    })}
                    role="button"
                    disabled={removingId === season.id}
                    onPress={() => void handleRemove(season)}
                    className="p-2"
                  >
                    {removingId === season.id ? (
                      <Spinner size="small" />
                    ) : (
                      <Ionicons
                        name="trash-outline"
                        size={20}
                        color={lightTheme.destructive}
                      />
                    )}
                  </Pressable>
                </View>

                <DatePickerInput
                  testID={`season-start-${season.id}`}
                  label={t("settings.seasons.start")}
                  value={season.startDate}
                  onChange={(v) => handleChange(season.id, "startDate", v)}
                />
                <DatePickerInput
                  testID={`season-end-${season.id}`}
                  label={t("settings.seasons.end")}
                  value={season.endDate}
                  onChange={(v) => handleChange(season.id, "endDate", v)}
                />
              </View>
            ))}

            {status ? (
              <Text
                testID="settings-seasons-status"
                className="text-sm text-muted-foreground"
              >
                {status}
              </Text>
            ) : null}

            <View className="flex-row gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                testID="settings-seasons-add"
                accessibilityLabel={t("settings.seasons.addSeason")}
                onPress={handleAdd}
              >
                <Text>{t("settings.seasons.addSeason")}</Text>
              </Button>
              <Button
                size="sm"
                className="flex-1"
                testID="settings-seasons-save"
                accessibilityLabel={t("settings.seasons.saveSeasons")}
                disabled={saving || seasons.length === 0}
                onPress={() => void handleSave()}
              >
                <Text>
                  {saving
                    ? t("settings.seasons.saving")
                    : t("settings.seasons.saveSeasons")}
                </Text>
              </Button>
            </View>
          </>
        )}
      </CardContent>
    </Card>
  );
}
