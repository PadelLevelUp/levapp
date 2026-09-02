import { Ionicons } from "@expo/vector-icons";
import { coachLevelApi } from "@levelup/api";
import { lightTheme } from "@levelup/config";
import { queryKeys, useCoachLevels } from "@levelup/hooks";
import { useQueryClient } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

type LevelDraft = {
  id: string;
  code: string;
  label: string;
  isNew?: boolean;
};

/**
 * Coach skill-levels editor, mirroring web's CoachLevelsSection. Web reorders
 * via HTML5 drag-and-drop; mobile uses per-row up/down buttons instead —
 * both persist the same way (handleSave re-POSTs the array, displayOrder
 * derived from list position).
 */
export function CoachLevelsSection() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { data, isLoading } = useCoachLevels();

  const [drafts, setDrafts] = React.useState<LevelDraft[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const hydratedRef = React.useRef(false);

  React.useEffect(() => {
    if (!data || hydratedRef.current) return;
    hydratedRef.current = true;
    setDrafts(
      [...data]
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((level) => ({ id: level.id, code: level.code, label: level.label }))
    );
  }, [data]);

  const handleAdd = () => {
    setDrafts((prev) => [
      ...prev,
      { id: `new-${Date.now()}`, code: "", label: "", isNew: true },
    ]);
  };

  /** Reordering is a pure array swap — handleSave already derives displayOrder
   * from list position, so this is all that's needed to persist a new order. */
  const handleMove = (index: number, direction: -1 | 1) => {
    setDrafts((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleChange = (
    id: string,
    field: "code" | "label",
    value: string
  ) => {
    setDrafts((prev) =>
      prev.map((l) => (l.id === id ? { ...l, [field]: value } : l))
    );
  };

  const handleRemove = async (draft: LevelDraft) => {
    if (draft.isNew) {
      setDrafts((prev) => prev.filter((l) => l.id !== draft.id));
      return;
    }
    setRemovingId(draft.id);
    try {
      await coachLevelApi.deleteCoachLevel(draft.id);
      setDrafts((prev) => prev.filter((l) => l.id !== draft.id));
      void queryClient.invalidateQueries({ queryKey: queryKeys.coachLevels });
    } catch {
      setStatus(t("settings.coachLevels.deleteFailed"));
    } finally {
      setRemovingId(null);
    }
  };

  const handleSave = async () => {
    if (drafts.some((l) => !l.code.trim() || !l.label.trim())) {
      setStatus(t("settings.coachLevels.validationErrorDescription"));
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      await coachLevelApi.addCoachLevel(
        drafts.map((l, i) => ({
          code: l.code,
          label: l.label,
          displayOrder: i + 1,
        }))
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.coachLevels });
      setStatus(t("settings.coachLevels.saved", { count: drafts.length }));
    } catch {
      setStatus(t("settings.coachLevels.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card testID="settings-levels">
      <CardHeader>
        <CardTitle>{t("settings.coachLevels.title")}</CardTitle>
        <CardDescription>
          {t("settings.mobile.coachLevelsDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="gap-3">
        {isLoading ? (
          <View className="gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </View>
        ) : (
          <>
            {drafts.map((draft, index) => {
              const isFirst = index === 0;
              const isLast = index === drafts.length - 1;
              return (
                <View key={draft.id} className="flex-row items-center gap-2">
                  <Input
                    accessibilityLabel={t("settings.coachLevels.code")}
                    placeholder={t("settings.coachLevels.codePlaceholder")}
                    className="w-20"
                    value={draft.code}
                    onChangeText={(v) => handleChange(draft.id, "code", v)}
                  />
                  <Input
                    accessibilityLabel={t("settings.coachLevels.label")}
                    placeholder={t("settings.coachLevels.labelPlaceholder")}
                    className="flex-1"
                    value={draft.label}
                    onChangeText={(v) => handleChange(draft.id, "label", v)}
                  />

                  {/* PAD-84: list position is the ranking (first = strongest,
                      matching the notification engine's "one level above"
                      matching), which is invisible otherwise. Mirrors web: the
                      two end markers name the ends, the rule + chevron down the
                      same column show the direction between them. Plain
                      Views/Text — never a Pressable, so nothing nests inside the
                      move/remove Pressables next to it. The rail is decorative
                      and hidden from the a11y tree; the markers carry the
                      meaning. The rest of this file is still hardcoded English
                      pending the mobile i18n retrofit, but new copy goes through
                      the shared locales. */}
                  {drafts.length > 1 ? (
                    <View className="w-14 items-center">
                      {isFirst ? (
                        <>
                          <Text
                            testID="level-highest-marker"
                            className="text-[10px] font-medium uppercase text-muted-foreground"
                          >
                            {t("settings.coachLevels.highestLevel")}
                          </Text>
                          <View
                            accessibilityElementsHidden
                            importantForAccessibility="no-hide-descendants"
                            className="mt-1 h-2 w-px bg-border"
                          />
                        </>
                      ) : isLast ? (
                        <>
                          <View
                            accessibilityElementsHidden
                            importantForAccessibility="no-hide-descendants"
                          >
                            <Ionicons
                              name="chevron-down"
                              size={12}
                              color={lightTheme.mutedForeground}
                            />
                          </View>
                          <Text
                            testID="level-lowest-marker"
                            className="text-[10px] font-medium uppercase text-muted-foreground"
                          >
                            {t("settings.coachLevels.lowestLevel")}
                          </Text>
                        </>
                      ) : (
                        <View
                          accessibilityElementsHidden
                          importantForAccessibility="no-hide-descendants"
                          className="h-5 w-px bg-border"
                        />
                      )}
                    </View>
                  ) : null}

                  <View className="gap-0.5">
                    <Pressable
                      testID={`level-move-up-${index}`}
                      accessibilityLabel={t("settings.mobile.moveLevelUp")}
                      role="button"
                      disabled={isFirst}
                      onPress={() => handleMove(index, -1)}
                      className={cn(
                        "h-5 w-6 items-center justify-center",
                        isFirst && "opacity-40"
                      )}
                    >
                      <Ionicons
                        name="chevron-up"
                        size={16}
                        color={
                          isFirst
                            ? lightTheme.mutedForeground
                            : lightTheme.foreground
                        }
                      />
                    </Pressable>
                    <Pressable
                      testID={`level-move-down-${index}`}
                      accessibilityLabel={t("settings.mobile.moveLevelDown")}
                      role="button"
                      disabled={isLast}
                      onPress={() => handleMove(index, 1)}
                      className={cn(
                        "h-5 w-6 items-center justify-center",
                        isLast && "opacity-40"
                      )}
                    >
                      <Ionicons
                        name="chevron-down"
                        size={16}
                        color={
                          isLast
                            ? lightTheme.mutedForeground
                            : lightTheme.foreground
                        }
                      />
                    </Pressable>
                  </View>
                  <Pressable
                    accessibilityLabel={t("settings.mobile.removeLevel", {
                      name: draft.label || draft.code || "",
                    })}
                    role="button"
                    disabled={removingId === draft.id}
                    onPress={() => void handleRemove(draft)}
                    className="p-2"
                  >
                    <Ionicons
                      name="trash-outline"
                      size={20}
                      color={lightTheme.destructive}
                    />
                  </Pressable>
                </View>
              );
            })}

            {status ? (
              <Text className="text-sm text-muted-foreground">{status}</Text>
            ) : null}

            <View className="flex-row gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                testID="settings-levels-add"
                accessibilityLabel={t("settings.coachLevels.addLevel")}
                onPress={handleAdd}
              >
                <Text>{t("settings.coachLevels.addLevel")}</Text>
              </Button>
              <Button
                size="sm"
                testID="settings-levels-save"
                accessibilityLabel={t("settings.coachLevels.saveLevels")}
                disabled={saving || drafts.length === 0}
                onPress={() => void handleSave()}
              >
                <Text>
                  {saving
                    ? t("settings.coachLevels.saving")
                    : t("settings.coachLevels.saveLevels")}
                </Text>
              </Button>
            </View>
          </>
        )}
      </CardContent>
    </Card>
  );
}
