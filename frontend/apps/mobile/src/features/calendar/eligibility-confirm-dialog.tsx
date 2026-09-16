/**
 * PAD-150 — "these students don't meet the bar; add them anyway?" (iOS).
 *
 * Same rule as web's EligibilityConfirmDialog (eligibility.enforcement 7d):
 * one block per failing student, one line per failed rule, through the
 * shared renderer. Confirm proceeds, Cancel aborts and keeps the draft.
 */
import type { EligibilityCheckEntry } from "@levelup/types";
import { describeIneligible, resolveText } from "@levelup/config";
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
import { Text } from "@/components/ui/text";

export function EligibilityConfirmDialog({
  open,
  ineligible,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  ineligible: EligibilityCheckEntry[];
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const students = React.useMemo(() => describeIneligible(ineligible), [ineligible]);

  return (
    <AlertDialog open={open} onOpenChange={(next) => (!next ? onCancel() : null)}>
      <AlertDialogContent testID="eligibility-confirm">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("calendar.eligibilityConfirm.title")}</AlertDialogTitle>
          <AlertDialogDescription>{t("calendar.eligibilityConfirm.body")}</AlertDialogDescription>
        </AlertDialogHeader>
        <View className="gap-2">
          {students.map((s) => (
            <View key={s.playerId} testID="eligibility-confirm-student">
              <Text className="text-sm font-sans-semibold">{s.name}</Text>
              {s.reasons.map((r, i) => (
                <Text key={i} className="text-sm text-muted-foreground" testID="eligibility-confirm-reason">
                  {"• "}
                  {resolveText(t, r)}
                </Text>
              ))}
            </View>
          ))}
        </View>
        <AlertDialogFooter>
          <AlertDialogCancel testID="eligibility-confirm-cancel" onPress={onCancel}>
            <Text>{t("calendar.eligibilityConfirm.cancel")}</Text>
          </AlertDialogCancel>
          <AlertDialogAction testID="eligibility-confirm-proceed" onPress={onConfirm}>
            <Text>{t("calendar.eligibilityConfirm.confirm")}</Text>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
