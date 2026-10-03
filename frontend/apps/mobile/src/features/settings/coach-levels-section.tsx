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
import { useSectionSave } from "@/features/settings/unsaved-registry";
import { cn } from "@/lib/utils";

type LevelDraft = {
  id: string;
  code: string;
  label: string;
  isNew?: boolean;
};

type SavedLevel = { id: string; code: string; label: string };

/**
 * settings.unsaved-edits rule 2 — "differs by value from the last loaded or saved
 * value", compared POSITIONALLY: reordering (`handleMove`) is itself a real edit
 * (`save` derives `displayOrder` from list position), so two lists with the same
 * rows in a different order are NOT equal. A new row's generated id never matches a
 * saved id, so add/remove fall out of the same comparison for free.
 */
export function levelsUnsaved(
  drafts: readonly SavedLevel[],
  saved: readonly SavedLevel[]
): boolean {
  if (drafts.length !== saved.length) return true;
  return drafts.some(
    (d, i) => d.id !== saved[i].id || d.code !== saved[i].code || d.label !== saved[i].label
  );
}

/**
 * Coach skill-levels editor, mirroring web's CoachLevelsSection. Web reorders
 * via HTML5 drag-and-drop; mobile uses per-row up/down buttons instead —
 * both persist the same way (`save` re-POSTs the array, displayOrder
 * derived from list position).
 */
export function CoachLevelsSection() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { data, isLoading } = useCoachLevels();

  const [drafts, setDrafts] = React.useState<LevelDraft[]>([]);
  // The last loaded/saved baseline (settings.unsaved-edits rule 2), separate from
  // `drafts` (which holds in-progress edits). Updated on the initial load and on a
  // successful Save — a removed row too waits for the Save since PAD-506.
  const [saved, setSaved] = React.useState<SavedLevel[]>([]);
  const [status, setStatus] = React.useState<string | null>(null);
  const hydratedRef = React.useRef(false);

  React.useEffect(() => {
    if (!data || hydratedRef.current) return;
    hydratedRef.current = true;
    const loaded = [...data]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((level) => ({ id: level.id, code: level.code, label: level.label }));
    setDrafts(loaded);
    setSaved(loaded);
  }, [data]);


  const handleAdd = () => {
    setDrafts((prev) => [
      ...prev,
      { id: `new-${Date.now()}`, code: "", label: "", isNew: true },
    ]);
  };

  /** Reordering is a pure array swap — `save` already derives displayOrder
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

  // settings.explicit-save (PAD-506): removing a row is an edit like any other — held until the
  // screen's Save, which deletes the stored rows that are gone.
  const handleRemove = (draft: LevelDraft) => {
    setDrafts((prev) => prev.filter((l) => l.id !== draft.id));
  };

  // settings.explicit-save rule 3: this section's part of the one Save; throws on a refusal, so the
  // levels stay unsaved and the next Save retries them.
  const save = async () => {
    if (drafts.some((l) => !l.code.trim() || !l.label.trim())) {
      setStatus(t("settings.coachLevels.validationErrorDescription"));
      throw new Error("invalid levels");
    }
    setStatus(null);
    const kept = new Set(drafts.map((l) => l.id));
    for (const gone of saved.filter((l) => !kept.has(l.id))) {
      try {
        await coachLevelApi.deleteCoachLevel(gone.id);
      } catch (e) {
        setStatus(t("settings.coachLevels.deleteFailed"));
        throw e;
      }
      setSaved((prev) => prev.filter((l) => l.id !== gone.id));
    }
    await coachLevelApi.addCoachLevel(
      drafts.map((l, i) => ({
        code: l.code,
        label: l.label,
        displayOrder: i + 1,
      }))
    );
    // Re-key the rows with the server's ids (the upsert does not echo them), so a row added now and
    // removed later is deleted by its real id (PAD-101). The fresh rows are the clean baseline (rule 2).
    const fresh = [...(await coachLevelApi.getCoachLevels())]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((level) => ({ id: level.id, code: level.code, label: level.label }));
    setDrafts(fresh);
    setSaved(fresh);
    void queryClient.invalidateQueries({ queryKey: queryKeys.coachLevels });
  };
  useSectionSave("coachLevels", levelsUnsaved(drafts, saved), { label: t("settings.coachLevels.title"), save });

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
                    testID={`level-code-${index}`}
                    accessibilityLabel={t("settings.coachLevels.code")}
                    placeholder={t("settings.coachLevels.codePlaceholder")}
                    className="w-20"
                    value={draft.code}
                    onChangeText={(v) => handleChange(draft.id, "code", v)}
                  />
                  <Input
                    testID={`level-label-${index}`}
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
                    onPress={() => handleRemove(draft)}
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
            </View>
          </>
        )}
      </CardContent>
    </Card>
  );
}
