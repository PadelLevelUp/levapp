import { useDeleteEvaluationCompetency, useEvaluationCompetencyImpact } from "@levelup/hooks";
import type { EvaluationCompetency } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";

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
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

interface DeleteCompetencyDialogProps {
  /** The custom or legacy competency to delete; `null` closes the dialog. */
  competency: EvaluationCompetency | null;
  onClose: () => void;
}

/**
 * PAD-274's safeguards, exactly as they were, through the NEW endpoints
 * (evaluations.competencies rule 9): the impact is read first, the coach types the name,
 * the server writes the audit row. It cannot be confirmed if the impact could not be read.
 * An AlertDialog on a pushed screen — never inside a native Modal.
 */
export function DeleteCompetencyDialog({ competency, onClose }: DeleteCompetencyDialogProps) {
  const { t } = useTranslation();
  const impact = useEvaluationCompetencyImpact(competency?.id ?? null, competency !== null);
  const remove = useDeleteEvaluationCompetency();
  const [typedName, setTypedName] = React.useState("");
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setTypedName("");
    setFailed(false);
  }, [competency?.id]);

  // The name to type is the ROW's (what the coach sees in the title); the impact carries the
  // counts and must be read before a delete can be confirmed (rule 9). Session-B, #361.
  const nameMatches = impact.data !== undefined && competency !== null && typedName.trim() === competency.name.trim();

  const confirm = async () => {
    if (!competency || !nameMatches || remove.isPending) return;
    setFailed(false);
    try {
      await remove.mutateAsync(competency.id);
      onClose();
    } catch {
      setFailed(true);
    }
  };

  return (
    <AlertDialog
      open={competency !== null}
      onOpenChange={(open) => { if (!open && !remove.isPending) onClose(); }}
    >
      <AlertDialogContent testID="competency-delete-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("evaluations.manager.deleteTitle", { name: competency?.name ?? "" })}</AlertDialogTitle>
          <AlertDialogDescription testID={impact.isError ? "competency-delete-impact-failed" : "competency-delete-impact"}>
            {impact.isError
              ? t("evaluations.manager.impactFailed")
              : impact.data
                ? impact.data.scores > 0
                  ? t("evaluations.manager.deleteImpact", { scores: impact.data.scores, players: impact.data.players })
                  : t("evaluations.manager.deleteImpactNone")
                : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <View className="gap-1">
          <Text className="text-sm font-medium">{t("evaluations.manager.deleteTypeName")}</Text>
          <Input
            testID="competency-delete-name"
            accessibilityLabel={t("evaluations.manager.deleteTypeName")}
            autoCapitalize="none"
            autoCorrect={false}
            value={typedName}
            onChangeText={setTypedName}
          />
          {failed ? (
            <Text testID="competency-delete-failed" role="alert" className="text-xs text-destructive">
              {t("evaluations.manager.saveFailed")}
            </Text>
          ) : null}
        </View>
        <AlertDialogFooter>
          <AlertDialogCancel testID="competency-delete-cancel" disabled={remove.isPending}>
            <Text>{t("evaluations.manager.cancel")}</Text>
          </AlertDialogCancel>
          <AlertDialogAction
            testID="competency-delete-confirm"
            className="bg-destructive"
            // AlertDialogAction, unlike Button, does not dim itself when disabled: seen on the
            // simulator (2026-09-21) as a full-red "Delete" beside an empty name field. A style,
            // not a class swap — the opacity changes while the dialog is open.
            style={{ opacity: !nameMatches || remove.isPending ? 0.5 : 1 }}
            disabled={!nameMatches || remove.isPending}
            onPress={() => void confirm()}
          >
            <Text className="text-destructive-foreground">{t("evaluations.manager.deleteConfirm")}</Text>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
