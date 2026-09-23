import { Ionicons } from "@expo/vector-icons";
import { initialShareSelection, lightTheme, shareInput, toggleCategory, type ShareSelection } from "@levelup/config";
import { usePlayerEvaluations, useShareEvaluation, useShareEvaluationPreview } from "@levelup/hooks";
import { useRouter } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

import { ErrorState } from "@/components/error-state";
import { Screen } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";

import { ShareStep1, ShareStep2 } from "./share-evaluation-steps";

interface ShareEvaluationScreenProps {
  recordId: number;
  playerId: string;
  playerName: string;
}

/**
 * "Partilhar avaliação" on iOS (`evaluations.sharing` rules 2-3, 13-14): TWO
 * PUSHED screens sharing one route (`app/share-evaluation.tsx`), never a
 * native Modal (`native-modal-sheet-traps-ios` memory) — step 1 and step 2
 * (`ShareStep1`/`ShareStep2`, `./share-evaluation-steps.tsx`) are this
 * component's own state, so "Voltar" keeps the selection for free.
 * "Pré-visualizar" calls the SAME server function ("share_preview") that
 * step 2 renders through `EvaluationCard`, so the preview and what gets
 * shared can never disagree (rule 3). Both steps have their own explicit
 * close control (rule 13, AV-072) — the header's leading button, which never
 * submits anything: only "Partilhar" (step 2) writes.
 */
export function ShareEvaluationScreen({ recordId, playerId, playerName }: ShareEvaluationScreenProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const history = usePlayerEvaluations(playerId);
  const record = history.data?.records.find((r) => r.id === recordId) ?? null;

  const [selection, setSelection] = React.useState<ShareSelection | null>(null);
  const [step, setStep] = React.useState<"select" | "preview">("select");

  // Step 1's defaults (rule 2): every rated competency starts ticked, in the
  // record's own order. Set once, the first time the record is available —
  // never re-derived while the coach is choosing (that would undo taps).
  React.useEffect(() => {
    if (record && selection === null) setSelection(initialShareSelection(record));
  }, [record, selection]);

  const preview = useShareEvaluationPreview();
  const share = useShareEvaluation(playerId);

  const firstName = playerName.trim().split(/\s+/)[0] || playerName;

  const handlePreview = () => {
    if (!selection) return;
    preview.mutate(
      { recordId, input: shareInput(selection) },
      {
        onSuccess: () => setStep("preview"),
        onError: () => toast.error(t("players.evaluationSharing.share.error")),
      }
    );
  };

  const handleShare = () => {
    if (!selection) return;
    share.mutate(
      { recordId, input: shareInput(selection) },
      {
        onSuccess: () => router.back(),
        onError: () => toast.error(t("players.evaluationSharing.share.error")),
      }
    );
  };

  const loading = history.isLoading || (!!record && selection === null);
  const notFound = !history.isLoading && !history.isError && !record;

  return (
    <Screen edges={["top"]} testID="share-evaluation">
      <View className="flex-row items-center gap-1 border-b border-border px-2 py-2">
        <Button
          variant="ghost"
          size="icon"
          testID={step === "select" ? "share-cancel" : "share-back"}
          accessibilityLabel={t(step === "select" ? "players.evaluationSharing.share.cancel" : "players.evaluationSharing.share.back")}
          onPress={step === "select" ? () => router.back() : () => setStep("select")}
        >
          <Ionicons name="chevron-back" size={24} color={lightTheme.foreground} />
        </Button>
        <Text role="heading" aria-level={1} className="flex-1 text-xl font-bold" numberOfLines={1}>
          {step === "select"
            ? t("players.evaluationSharing.share.step1Title", { name: firstName })
            : t("players.evaluationSharing.share.previewTitle")}
        </Text>
      </View>

      {loading ? <Skeleton className="m-4 h-40" /> : null}
      {history.isError || notFound ? (
        <ErrorState message={t("players.evaluationSharing.share.error")} onRetry={() => void history.refetch()} />
      ) : null}

      {record && selection ? (
        step === "select" ? (
          <ShareStep1
            record={record}
            selection={selection}
            onToggleCategory={(categoryId) => setSelection((s) => (s ? toggleCategory(s, categoryId) : s))}
            onEvolutionChange={(evolution) => setSelection((s) => (s ? { ...s, evolution } : s))}
            onIncludeNoteChange={(includeNote) => setSelection((s) => (s ? { ...s, includeNote } : s))}
            onPreview={handlePreview}
            previewing={preview.isPending}
          />
        ) : (
          <ShareStep2 card={preview.data ?? null} onSubmit={handleShare} submitting={share.isPending} />
        )
      ) : null}
    </Screen>
  );
}
