import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import type { CalendarEvent } from "@levelup/types";
import { useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  addWeeks,
  endOfWeek,
  format,
  startOfWeek,
  subWeeks,
} from "date-fns";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { useEditClass } from "@/features/calendar/hooks";
import { cn } from "@/lib/utils";
import { useClassInstancesForWeek } from "./hooks";

interface AddToClassesDialogProps {
  open: boolean;
  onClose: () => void;
  playerId: string;
  playerName: string | null;
}

/**
 * Mobile port of web's AddToClassesDialog.tsx — with the save wired for
 * real (see the web fix in the same PR: web's onSave only used to fire a
 * toast, never called the API). Adding a participant from outside
 * class-detail context works the same way ClassDetailSheet's participant
 * edits do: POST /app/edit_class with `updates.addPlayers` and
 * `scope: "single"` (padel_app/services/lesson_service.py
 * edit_lesson_instance_helper / create_lesson_instance_helper both apply
 * `add_player_ids` unconditionally — no existing participant list needs to
 * be round-tripped first).
 */
export function AddToClassesDialog({
  open,
  onClose,
  playerId,
  playerName,
}: AddToClassesDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const editClass = useEditClass();

  const [weekStart, setWeekStart] = React.useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(
    new Set()
  );
  const [saving, setSaving] = React.useState(false);

  const weekEnd = React.useMemo(
    () => endOfWeek(weekStart, { weekStartsOn: 1 }),
    [weekStart]
  );
  const from = format(weekStart, "yyyy-MM-dd");
  const to = format(weekEnd, "yyyy-MM-dd");

  const { data, isPending } = useClassInstancesForWeek(from, to, open);
  const classes = data ?? [];

  React.useEffect(() => {
    if (!open) return;
    setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
    setSelectedIds(new Set());
  }, [open]);

  const weekDays = React.useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const classesByDate = React.useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>();
    const sorted = [...classes]
      .filter((c) => c.status !== "canceled")
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)
      );
    for (const cls of sorted) {
      const existing = grouped.get(cls.date) ?? [];
      existing.push(cls);
      grouped.set(cls.date, existing);
    }
    return grouped;
  }, [classes]);

  const toggleClass = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  const handleSave = async () => {
    const targets = classes.filter((c) => selectedIds.has(c.id));
    if (targets.length === 0) return;
    setSaving(true);

    let successCount = 0;
    let failureCount = 0;
    for (const cls of targets) {
      try {
        await editClass.mutateAsync({
          event: cls,
          updates: { addPlayers: [playerId] },
          scope: "single",
        });
        successCount++;
      } catch {
        failureCount++;
      }
    }

    // useEditClass's own invalidation doesn't cover this dialog's week query.
    void queryClient.invalidateQueries({ queryKey: ["class-instances-week"] });

    setSaving(false);

    if (successCount > 0) {
      toast.success(
        t("players.addedToClasses", {
          name: playerName ?? t("players.defaultPlayerName"),
          count: successCount,
        })
      );
    }
    if (failureCount > 0) {
      toast.error(t("common.somethingWentWrong"));
    }
    if (successCount > 0) {
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent testID="add-to-classes-dialog">
        <DialogHeader>
          <DialogTitle>
            {t("players.addToClassesTitle", {
              name: playerName ?? t("players.defaultPlayerName"),
            })}
          </DialogTitle>
          <DialogDescription>
            {t("players.addToClassesDescription")}
          </DialogDescription>
        </DialogHeader>

        <View className="flex-row items-center justify-between py-1">
          <Pressable
            testID="add-to-classes-week-prev"
            accessibilityLabel={t("calendar.toolbar.previousWeek")}
            role="button"
            onPress={() => setWeekStart((w) => subWeeks(w, 1))}
            className="h-9 w-9 items-center justify-center rounded-md active:bg-accent"
          >
            <Ionicons
              name="chevron-back"
              size={18}
              color={lightTheme.foreground}
            />
          </Pressable>
          <Text className="text-sm font-medium">
            {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d, yyyy")}
          </Text>
          <Pressable
            testID="add-to-classes-week-next"
            accessibilityLabel={t("calendar.toolbar.nextWeek")}
            role="button"
            onPress={() => setWeekStart((w) => addWeeks(w, 1))}
            className="h-9 w-9 items-center justify-center rounded-md active:bg-accent"
          >
            <Ionicons
              name="chevron-forward"
              size={18}
              color={lightTheme.foreground}
            />
          </Pressable>
        </View>

        <ScrollView className="max-h-96" keyboardShouldPersistTaps="handled">
          {isPending ? (
            <View className="gap-3 py-2">
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </View>
          ) : classes.length === 0 ? (
            <Text className="py-8 text-center text-sm text-muted-foreground">
              {t("players.noClassesThisWeek")}
            </Text>
          ) : (
            <View className="gap-4 py-2">
              {weekDays.map((day) => {
                const dateStr = format(day, "yyyy-MM-dd");
                const dayClasses = classesByDate.get(dateStr);
                if (!dayClasses || dayClasses.length === 0) return null;

                return (
                  <View key={dateStr} className="gap-2">
                    <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {format(day, "EEEE, MMM d")}
                    </Text>
                    <View className="gap-2">
                      {dayClasses.map((cls) => {
                        const isSelected = selectedIds.has(cls.id);
                        const isFull =
                          cls.maxPlayers != null &&
                          (cls.participantCount ?? 0) >= cls.maxPlayers;

                        return (
                          <Pressable
                            key={cls.id}
                            testID={`add-to-classes-class-${cls.id}`}
                            accessibilityLabel={cls.title || t("players.unnamedClass")}
                            role="button"
                            disabled={isFull}
                            onPress={() => toggleClass(cls.id)}
                            className={cn(
                              "flex-row items-center gap-3 rounded-lg border p-3",
                              isSelected && !isFull
                                ? "border-primary bg-primary/5"
                                : "border-border active:bg-accent",
                              isFull && "opacity-50"
                            )}
                          >
                            <View
                              className="h-10 w-1 rounded-full"
                              style={{
                                backgroundColor: cls.color ?? lightTheme.primary,
                              }}
                            />
                            <View className="min-w-0 flex-1">
                              <Text
                                className="text-sm font-medium"
                                numberOfLines={1}
                              >
                                {cls.title || t("players.unnamedClass")}
                              </Text>
                              <Text className="text-xs text-muted-foreground">
                                {cls.startTime} – {cls.endTime}
                                {cls.maxPlayers != null
                                  ? `  ${t("players.classParticipants", {
                                      n: cls.participantCount ?? 0,
                                      max: cls.maxPlayers,
                                    })}`
                                  : ""}
                              </Text>
                            </View>
                            {isFull ? (
                              <Badge variant="outline">
                                <Text className="text-xs">
                                  {t("players.classFull")}
                                </Text>
                              </Badge>
                            ) : (
                              <Ionicons
                                name={
                                  isSelected
                                    ? "checkmark-circle"
                                    : "ellipse-outline"
                                }
                                size={22}
                                color={
                                  isSelected
                                    ? lightTheme.primary
                                    : lightTheme.mutedForeground
                                }
                              />
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        <DialogFooter className="flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            accessibilityLabel={t("players.cancelAddToClassesAria")}
            onPress={handleClose}
            disabled={saving}
          >
            <Text>{t("common.cancel")}</Text>
          </Button>
          <Button
            testID="add-to-classes-save"
            accessibilityLabel={t("players.addToSelectedClassesAria")}
            className="flex-1"
            disabled={selectedIds.size === 0 || saving}
            onPress={() => void handleSave()}
          >
            {saving ? (
              <Spinner size="small" color={lightTheme.primaryForeground} />
            ) : null}
            <Text>
              {t("players.addToSelectedClasses", { count: selectedIds.size })}
            </Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
