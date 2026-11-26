/**
 * calendar.student-blockers rule 21 (PAD-772): after a block is saved and the save answers covered classes,
 * ONE dialog lists them and asks whether the student is not going. Only "Sim, não vou" marks them (the
 * shared decision in `@levelup/config`); "Manter as aulas" changes nothing. The block is already saved: a
 * failed mark says so and leaves it. Twin of web's `components/availability/BlockerCoveredDialog.tsx`.
 */
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { coveredClassParts, decideCoveredFollowUp, type CoveredClass } from "@levelup/config";
import { refreshAfterCoveredMark } from "@levelup/hooks";
import * as availabilityApi from "@levelup/api/src/resources/availability";
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
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { nativeLocaleTag } from "@/lib/native-locale";

export function useBlockerCoveredFollowUp(): {
  /** Run after a block save with the save's answer (or the schedule read's list); resolves when it is all over. */
  follow: (answer: { coveredClasses?: unknown } | null | undefined) => Promise<void>;
  dialog: React.ReactNode;
} {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [asking, setAsking] = React.useState<CoveredClass[] | null>(null);
  const answer = React.useRef<((choice: "yes" | "keep") => void) | null>(null);

  const ask = React.useCallback(
    (classes: CoveredClass[]) =>
      new Promise<"yes" | "keep">((resolve) => {
        answer.current = (choice) => {
          answer.current = null;
          setAsking(null);
          resolve(choice);
        };
        setAsking(classes);
      }),
    []
  );

  const follow = React.useCallback(
    async (saveAnswer: { coveredClasses?: unknown } | null | undefined) => {
      const outcome = await decideCoveredFollowUp(saveAnswer, ask, availabilityApi.declineCoveredClasses);
      if (outcome.answered !== "yes") return;
      if (outcome.failed) {
        toast.error(t("availability.covered.failed"));
      } else if (outcome.marked > 0) {
        void refreshAfterCoveredMark(queryClient);
        toast.success(t("availability.covered.marked", { count: outcome.marked }));
      } else {
        toast.success(t("availability.covered.markedNone"));
      }
    },
    [ask, queryClient, t]
  );

  const tag = nativeLocaleTag(i18n?.language);
  const dialog = (
    <AlertDialog
      open={asking !== null}
      onOpenChange={(open) => {
        // Dismissing the dialog any other way is "keep": nothing is marked.
        if (!open) answer.current?.("keep");
      }}
    >
      <AlertDialogContent testID="blocker-covered-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("availability.covered.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("availability.covered.body", { count: asking?.length ?? 0 })}</AlertDialogDescription>
        </AlertDialogHeader>
        <View className="gap-1">
          {(asking ?? []).map((c, index) => (
            <Text key={`${c.model}-${c.originalId}-${c.date}`} className="text-sm" testID={`blocker-covered-item-${index}`}>
              {t("availability.covered.item", coveredClassParts(c, tag))}
            </Text>
          ))}
        </View>
        <AlertDialogFooter>
          <AlertDialogCancel testID="blocker-covered-keep" onPress={() => answer.current?.("keep")}>
            <Text>{t("availability.covered.keep")}</Text>
          </AlertDialogCancel>
          <AlertDialogAction testID="blocker-covered-decline" onPress={() => answer.current?.("yes")}>
            <Text>{t("availability.covered.decline")}</Text>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return { follow, dialog };
}
