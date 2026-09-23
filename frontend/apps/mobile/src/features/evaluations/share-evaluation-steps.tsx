import { canPreview, competencyLabel, type ShareSelection } from "@levelup/config";
import type { EvaluationCard as EvaluationCardData, EvaluationRecord, EvaluationShareEvolution } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, View } from "react-native";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

import { EvaluationCard } from "./evaluation-card";

/**
 * The two steps of "Partilhar avaliação" (`evaluations.sharing` rules 2, 3, 6),
 * kept in their OWN module — no `@/components/screen` (real
 * `react-native-safe-area-context`), no `expo-router`, no react-query — so
 * they mount directly in a unit test (`mobile-harness-cannot-mount-react-
 * query-hooks`: the harness cannot load the Screen wrapper or the real
 * hooks). `ShareEvaluationScreen` composes these with its own chrome and data.
 */

const EVOLUTION_OPTIONS: { value: EvaluationShareEvolution; labelKey: string }[] = [
  { value: "last", labelKey: "players.evaluationSharing.share.evolutionLast" },
  { value: "6m", labelKey: "players.evaluationSharing.share.evolution6m" },
  { value: "1y", labelKey: "players.evaluationSharing.share.evolution1y" },
  { value: "none", labelKey: "players.evaluationSharing.share.evolutionNone" },
];

interface ShareStep1Props {
  record: EvaluationRecord;
  selection: ShareSelection;
  onToggleCategory: (categoryId: number) => void;
  onEvolutionChange: (evolution: EvaluationShareEvolution) => void;
  onIncludeNoteChange: (includeNote: boolean) => void;
  onPreview: () => void;
  previewing: boolean;
}

/**
 * Step 1 (`evaluations.sharing` rule 2): a checkbox per rating — in
 * `record.ratings`' own order (rule 4: never the order of ticking) — all
 * pre-selected; the four evolution pills; the note switch only when the
 * record has a note, off by default (never pre-ticked). "Pré-visualizar" is
 * disabled with every box clear (rule 6).
 */
export function ShareStep1({
  record,
  selection,
  onToggleCategory,
  onEvolutionChange,
  onIncludeNoteChange,
  onPreview,
  previewing,
}: ShareStep1Props) {
  const { t } = useTranslation();
  const disablePreview = !canPreview(selection) || previewing;

  return (
    <ScrollView contentContainerClassName="gap-6 p-4 pb-12">
      <View className="gap-1">
        {record.ratings.map((rating) => {
          const checked = selection.categoryIds.includes(rating.categoryId);
          return (
            <Pressable
              key={rating.categoryId}
              testID={`share-category-${rating.categoryId}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              onPress={() => onToggleCategory(rating.categoryId)}
              className="min-h-11 flex-row items-center gap-3 py-2"
            >
              <Checkbox checked={checked} onCheckedChange={() => onToggleCategory(rating.categoryId)} />
              <Text className="flex-1 text-sm">
                {t("players.evaluationSharing.share.competencyOption", {
                  name: competencyLabel(t, rating),
                  score: rating.score,
                  max: rating.scaleMax,
                })}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View className="gap-2">
        <Text className="text-xs font-semibold uppercase text-muted-foreground">
          {t("players.evaluationSharing.share.evolutionLabel")}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {EVOLUTION_OPTIONS.map((option) => {
            const active = selection.evolution === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => onEvolutionChange(option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                testID={`share-evolution-${option.value}`}
                className={cn(
                  "min-h-11 justify-center rounded-full border px-4",
                  active ? "border-primary bg-primary" : "border-border bg-background"
                )}
              >
                <Text className={cn("text-sm", active ? "text-primary-foreground" : "text-foreground")}>
                  {t(option.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {record.note ? (
        <View className="flex-row items-center justify-between gap-3">
          <Text className="flex-1 text-sm">{t("players.evaluationSharing.share.includeNote")}</Text>
          <Switch
            testID="share-include-note"
            accessibilityLabel={t("players.evaluationSharing.share.includeNote")}
            checked={selection.includeNote}
            onCheckedChange={onIncludeNoteChange}
          />
        </View>
      ) : null}

      <Button disabled={disablePreview} onPress={onPreview} testID="share-preview">
        <Text className="font-sans-semibold text-primary-foreground">{t("players.evaluationSharing.share.preview")}</Text>
      </Button>
    </ScrollView>
  );
}

interface ShareStep2Props {
  card: EvaluationCardData | null;
  onSubmit: () => void;
  submitting: boolean;
}

/**
 * Step 2 (`evaluations.sharing` rule 3): the preview IS what the player gets
 * — rendered with the same `EvaluationCard` the player's own read uses, so
 * the two can never disagree. "Voltar" lives in the screen's header (keeps
 * the selection, rule 13); "Partilhar" is this step's one write.
 */
export function ShareStep2({ card, onSubmit, submitting }: ShareStep2Props) {
  const { t } = useTranslation();
  return (
    <ScrollView contentContainerClassName="gap-6 p-4 pb-12">
      {card ? <EvaluationCard card={card} /> : <Skeleton className="h-40 w-full" />}
      <Button disabled={!card || submitting} onPress={onSubmit} testID="share-submit">
        <Text className="font-sans-semibold text-primary-foreground">{t("players.evaluationSharing.share.submit")}</Text>
      </Button>
    </ScrollView>
  );
}
