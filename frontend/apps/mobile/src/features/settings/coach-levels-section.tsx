import { Ionicons } from "@expo/vector-icons";
import { coachLevelApi } from "@levelup/api";
import { lightTheme } from "@levelup/config";
import { queryKeys, useCoachLevels } from "@levelup/hooks";
import { useQueryClient } from "@tanstack/react-query";
import * as React from "react";
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
      setStatus("Failed to delete level.");
    } finally {
      setRemovingId(null);
    }
  };

  const handleSave = async () => {
    if (drafts.some((l) => !l.code.trim() || !l.label.trim())) {
      setStatus("All levels need a code and a label.");
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
      setStatus("Levels saved.");
    } catch {
      setStatus("Failed to save levels.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card testID="settings-levels">
      <CardHeader>
        <CardTitle>Skill levels</CardTitle>
        <CardDescription>
          Define the levels used to classify your players and exercises.
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
                    accessibilityLabel="Level code"
                    placeholder="Code"
                    className="w-20"
                    value={draft.code}
                    onChangeText={(v) => handleChange(draft.id, "code", v)}
                  />
                  <Input
                    accessibilityLabel="Level label"
                    placeholder="Label"
                    className="flex-1"
                    value={draft.label}
                    onChangeText={(v) => handleChange(draft.id, "label", v)}
                  />
                  <View className="gap-0.5">
                    <Pressable
                      testID={`level-move-up-${index}`}
                      accessibilityLabel="Move level up"
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
                      accessibilityLabel="Move level down"
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
                    accessibilityLabel={`Remove level ${draft.label || draft.code || "new"}`}
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
                accessibilityLabel="Add level"
                onPress={handleAdd}
              >
                <Text>Add level</Text>
              </Button>
              <Button
                size="sm"
                testID="settings-levels-save"
                accessibilityLabel="Save levels"
                disabled={saving || drafts.length === 0}
                onPress={() => void handleSave()}
              >
                <Text>{saving ? "Saving…" : "Save levels"}</Text>
              </Button>
            </View>
          </>
        )}
      </CardContent>
    </Card>
  );
}
