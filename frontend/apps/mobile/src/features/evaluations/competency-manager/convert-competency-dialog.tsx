import { competencyLabel, strandedSubs, suggestConversion } from "@levelup/config";
import { evaluationApiErrorCode, useConvertEvaluationCompetency, useEvaluationCompetencies } from "@levelup/hooks";
import type { EvaluationCompetency } from "@levelup/types";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Text } from "@/components/ui/text";

interface ConvertCompetencyDialogProps {
  /** The legacy row to convert; `null` closes the dialog. */
  competency: EvaluationCompetency | null;
  onClose: () => void;
}

/**
 * PAD-480 (evaluations.competencies rule 18) — the iOS twin of web's `ConvertCompetencyDialog`, same
 * behaviour and test ids: converts a legacy category into a default category on the coach's
 * confirmation, and offers to move the default's strays under it. Hosted by the screen, not the row:
 * once converted the row leaves the legacy section, and a failed move must still be said.
 */
export function ConvertCompetencyDialog({ competency, onClose }: ConvertCompetencyDialogProps) {
  const { t } = useTranslation();
  const competencies = useEvaluationCompetencies();
  const convert = useConvertEvaluationCompetency();
  const [target, setTarget] = React.useState<string | null>(null);
  const [moveStrays, setMoveStrays] = React.useState(true);
  const [errorText, setErrorText] = React.useState<string | null>(null);
  const [notMoved, setNotMoved] = React.useState<string[] | null>(null);
  // What the dialog was opened for, held while it is open: the list it read changes under it.
  const [offer, setOffer] = React.useState<{ name: string; targets: string[] } | null>(null);

  React.useEffect(() => {
    const suggestion = competency && competencies.data ? suggestConversion(competencies.data, competency) : null;
    setOffer(competency && suggestion ? { name: competency.name.trim(), targets: suggestion.targets } : null);
    setTarget(suggestion?.suggested ?? null);
    setMoveStrays(true);
    setErrorText(null);
    setNotMoved(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read only when another row is opened
  }, [competency?.id]);

  const labelOf = (key: string) => competencyLabel(t, { key, name: "" });
  const strays = target && competencies.data && notMoved === null ? strandedSubs(competencies.data, target) : [];
  const label = target ? labelOf(target) : "";

  const confirm = async () => {
    if (!competency || !target || convert.isPending) return;
    setErrorText(null);
    try {
      const out = await convert.mutateAsync({
        id: competency.id,
        catalogueKey: target,
        moveIds: moveStrays ? strays.map((s) => s.id) : [],
      });
      if (out.notMoved.length === 0) return onClose();
      setNotMoved(strays.filter((s) => out.notMoved.includes(s.id)).map((s) => competencyLabel(t, s)));
    } catch (error) {
      const code = evaluationApiErrorCode(error);
      setErrorText(
        code === "default_held" ? t("evaluations.manager.convertDefaultHeld", { label })
          : code === "name_taken" ? t("evaluations.manager.convertNameTaken", { label })
            : t("evaluations.manager.saveFailed"),
      );
    }
  };

  return (
    <AlertDialog
      open={competency !== null && offer !== null}
      onOpenChange={(open) => { if (!open && !convert.isPending) onClose(); }}
    >
      <AlertDialogContent testID="competency-convert-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("evaluations.manager.convertTitle", { name: offer?.name ?? "", label })}</AlertDialogTitle>
          {notMoved !== null ? (
            <AlertDialogDescription testID="competency-convert-not-moved" role="alert">
              {t("evaluations.manager.convertNotMoved", { count: notMoved.length, name: offer?.name ?? "", label, names: notMoved.join(", ") })}
            </AlertDialogDescription>
          ) : (
            <View className="gap-2">
              <AlertDialogDescription>{t("evaluations.manager.convertBecomes", { label })}</AlertDialogDescription>
              <Text className="text-sm text-muted-foreground">{t("evaluations.manager.convertScores")}</Text>
              <Text testID="competency-convert-old-app" className="text-sm text-muted-foreground">
                {t("evaluations.manager.convertOldApp")}
              </Text>
              <Text className="text-sm text-muted-foreground">{t("evaluations.manager.convertIrreversible")}</Text>
            </View>
          )}
        </AlertDialogHeader>
        {notMoved === null ? (
          <View className="gap-3">
            {offer && offer.targets.length > 1 ? (
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className="text-sm text-muted-foreground">{t("evaluations.manager.convertTarget")}</Text>
                {offer.targets.map((key) => (
                  <Button key={key} size="sm" variant={key === target ? "default" : "outline"}
                    testID={`competency-convert-target-${key}`}
                    accessibilityState={{ selected: key === target, disabled: convert.isPending }}
                    disabled={convert.isPending} onPress={() => setTarget(key)}>
                    <Text>{labelOf(key)}</Text>
                  </Button>
                ))}
              </View>
            ) : null}
            {strays.length > 0 ? (
              <Pressable
                testID="competency-convert-move"
                role="checkbox"
                accessibilityState={{ checked: moveStrays, disabled: convert.isPending }}
                disabled={convert.isPending}
                onPress={() => setMoveStrays((on) => !on)}
                className="flex-row items-center gap-2"
              >
                <Checkbox checked={moveStrays} onCheckedChange={() => setMoveStrays((on) => !on)} disabled={convert.isPending} />
                <Text className="flex-1 text-sm">
                  {t(strays.every((s) => !s.isActive) ? "evaluations.manager.convertMoveStraysOff" : "evaluations.manager.convertMoveStrays",
                    { names: strays.map((s) => competencyLabel(t, s)).join(", "), label })}
                </Text>
              </Pressable>
            ) : null}
            {errorText ? (
              <Text testID="competency-convert-failed" role="alert" className="text-xs text-destructive">{errorText}</Text>
            ) : null}
          </View>
        ) : null}
        <AlertDialogFooter>
          {notMoved !== null ? (
            <AlertDialogAction testID="competency-convert-done" onPress={onClose}>
              <Text>{t("evaluations.manager.convertDone")}</Text>
            </AlertDialogAction>
          ) : (
            <>
              <AlertDialogCancel testID="competency-convert-cancel" disabled={convert.isPending}>
                <Text>{t("evaluations.manager.cancel")}</Text>
              </AlertDialogCancel>
              <Button testID="competency-convert-confirm" disabled={!target || convert.isPending} onPress={() => void confirm()}>
                <Text>{t("evaluations.manager.convertConfirm")}</Text>
              </Button>
            </>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
