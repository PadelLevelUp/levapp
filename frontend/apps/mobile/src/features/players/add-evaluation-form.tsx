import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import type { PlayerEvaluation } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useEvaluationCategories, usePostEvaluationEntry } from "./hooks";

interface AddEvaluationFormProps {
  open: boolean;
  onClose: () => void;
  playerId: string;
  currentEvaluations: PlayerEvaluation[];
}

/**
 * Mobile port of web's AddEvaluationSheet.tsx — category score entry only.
 * Web bundles strengths/weaknesses editing into the same sheet, but mobile's
 * PlayerDetailScreen already has a dedicated StrengthsWeaknesses card for
 * that, so this form submits empty strengths/weaknesses arrays (safe: the
 * backend add_evaluation_entry_service only *adds* new, deduped notes from
 * these lists — never replaces/clears existing ones).
 *
 * No slider primitive exists in components/ui, so each category gets a
 * stepper row (−/value/+) instead — mirrors the credits stepper pattern in
 * web's own AddToStandingWaitingListDialog.
 */
export function AddEvaluationForm({
  open,
  onClose,
  playerId,
  currentEvaluations,
}: AddEvaluationFormProps) {
  const { t } = useTranslation();
  const { data: categories, isPending: loadingCategories } =
    useEvaluationCategories(open);
  const postEntry = usePostEvaluationEntry();

  const [scores, setScores] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    if (!open || !categories) return;
    const initial: Record<string, number> = {};
    for (const cat of categories) {
      const existing = currentEvaluations.find(
        (e) => e.categoryName.toLowerCase() === cat.name.toLowerCase()
      );
      initial[cat.id] =
        existing?.score ?? Math.round((cat.scaleMin + cat.scaleMax) / 2);
    }
    setScores(initial);
  }, [open, categories, currentEvaluations]);

  const adjust = (catId: string, min: number, max: number, delta: number) => {
    setScores((prev) => {
      const current = prev[catId] ?? min;
      return { ...prev, [catId]: Math.min(max, Math.max(min, current + delta)) };
    });
  };

  const handleClose = () => {
    if (postEntry.isPending) return;
    onClose();
  };

  const handleSave = async () => {
    if (!categories || categories.length === 0) return;
    const scoreEntries = categories.map((cat) => ({
      categoryId: cat.id,
      value: scores[cat.id] ?? cat.scaleMin,
    }));
    try {
      await postEntry.mutateAsync({
        playerId,
        scores: scoreEntries,
        strengths: [],
        weaknesses: [],
      });
      toast.success(t("players.evaluationSaved"));
      onClose();
    } catch {
      toast.error(t("players.saveEvaluationFailed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent testID="add-evaluation-dialog">
        <DialogHeader>
          <DialogTitle>{t("players.addEvaluationTitle")}</DialogTitle>
        </DialogHeader>

        <ScrollView className="max-h-96" keyboardShouldPersistTaps="handled">
          <View className="gap-4 p-1">
            {loadingCategories ? (
              <View className="gap-3 py-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </View>
            ) : (
              (categories ?? []).map((cat) => {
                const value = scores[cat.id] ?? cat.scaleMin;
                const atMin = value <= cat.scaleMin;
                const atMax = value >= cat.scaleMax;
                return (
                  <View
                    key={cat.id}
                    testID={`evaluation-score-${cat.id}`}
                    className="flex-row items-center justify-between gap-3"
                  >
                    <Text
                      className="flex-1 text-sm font-medium"
                      numberOfLines={1}
                    >
                      {cat.name}
                    </Text>
                    <View className="flex-row items-center gap-3">
                      <Pressable
                        accessibilityLabel={`Decrease ${cat.name}`}
                        role="button"
                        hitSlop={8}
                        disabled={atMin}
                        onPress={() =>
                          adjust(cat.id, cat.scaleMin, cat.scaleMax, -1)
                        }
                        className={cn(
                          "h-8 w-8 items-center justify-center rounded-full bg-muted",
                          atMin && "opacity-40"
                        )}
                      >
                        <Ionicons
                          name="remove"
                          size={16}
                          color={lightTheme.foreground}
                        />
                      </Pressable>
                      <Text className="w-12 text-center text-sm font-semibold tabular-nums">
                        {value}/{cat.scaleMax}
                      </Text>
                      <Pressable
                        accessibilityLabel={`Increase ${cat.name}`}
                        role="button"
                        hitSlop={8}
                        disabled={atMax}
                        onPress={() =>
                          adjust(cat.id, cat.scaleMin, cat.scaleMax, 1)
                        }
                        className={cn(
                          "h-8 w-8 items-center justify-center rounded-full bg-muted",
                          atMax && "opacity-40"
                        )}
                      >
                        <Ionicons
                          name="add"
                          size={16}
                          color={lightTheme.foreground}
                        />
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>

        <DialogFooter className="flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            accessibilityLabel="Cancel evaluation"
            onPress={handleClose}
            disabled={postEntry.isPending}
          >
            <Text>{t("common.cancel")}</Text>
          </Button>
          <Button
            testID="evaluation-save"
            accessibilityLabel="Save evaluation"
            className="flex-1"
            disabled={
              postEntry.isPending || !categories || categories.length === 0
            }
            onPress={() => void handleSave()}
          >
            {postEntry.isPending ? (
              <Spinner size="small" color={lightTheme.primaryForeground} />
            ) : null}
            <Text>{t("players.saveEvaluation")}</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
