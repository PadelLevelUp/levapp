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

const COPY = {
  add: {
    title: "calendar.eligibilityConfirm.title",
    body: "calendar.eligibilityConfirm.body",
    confirm: "calendar.eligibilityConfirm.confirm",
  },
  invite: {
    title: "calendar.eligibilityConfirm.inviteTitle",
    body: "calendar.eligibilityConfirm.inviteBody",
    confirm: "calendar.eligibilityConfirm.inviteConfirm",
  },
} as const;

export function EligibilityConfirmDialog({
  open,
  ineligible,
  onCancel,
  onConfirm,
  action = "add",
  portalHost,
}: {
  open: boolean;
  ineligible: EligibilityCheckEntry[];
  onCancel: () => void;
  onConfirm: () => void;
  /** eligibility.enforcement rule 6a (PAD-562): the same dialog for a manual invite, with the
   *  invite verb — "Convidar alunos…?" / "Convidar mesmo assim". */
  action?: "add" | "invite";
  /** A PortalHost name when the dialog must draw on top of a native modal (the notify modal),
   *  as BlockerSheet does; defaults to the root host. */
  portalHost?: string;
}) {
  const { t } = useTranslation();
  // One entry per verb (eligibility.enforcement rules 6 and 6a): the add dialog's copy, or the
  // invite dialog's — the same sentence with the verb swapped.
  const copy = COPY[action];
  const students = React.useMemo(() => describeIneligible(ineligible), [ineligible]);

  return (
    <AlertDialog open={open} onOpenChange={(next) => (!next ? onCancel() : null)}>
      <AlertDialogContent testID="eligibility-confirm" portalHost={portalHost}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(copy.title)}</AlertDialogTitle>
          <AlertDialogDescription>{t(copy.body)}</AlertDialogDescription>
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
            <Text>{t(copy.confirm)}</Text>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
