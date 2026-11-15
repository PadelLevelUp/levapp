import * as React from "react";
import { useTranslation } from "react-i18next";
import { PRIVATE_LESSON_WARNING_KEYS } from "@levelup/config";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import { Text } from "@/components/ui/text";

interface PrivateLessonWarningDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * iOS port of web's `PrivateLessonWarningDialog.tsx` (PAD-929, `classes.join-requests` rule 22):
 * the question asked before a student joins a private lesson. NÃO closes it and sends nothing; SIM
 * lets the caller go on with `privateConfirmed: true`. Who is asked is `needsPrivateLessonWarning`
 * (@levelup/config); the copy is web's `calendar.privateLessonWarning.*`.
 */
export function PrivateLessonWarningDialog({ open, onCancel, onConfirm }: PrivateLessonWarningDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={(next) => (!next ? onCancel() : null)}>
      <AlertDialogContent testID="private-lesson-warning">
        <AlertDialogHeader>
          <AlertDialogDescription testID="private-lesson-warning-body">
            {t(PRIVATE_LESSON_WARNING_KEYS.body)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            testID="private-lesson-warning-no"
            accessibilityLabel={t(PRIVATE_LESSON_WARNING_KEYS.no)}
            onPress={onCancel}
          >
            <Text>{t(PRIVATE_LESSON_WARNING_KEYS.no)}</Text>
          </AlertDialogCancel>
          <AlertDialogAction
            testID="private-lesson-warning-yes"
            accessibilityLabel={t(PRIVATE_LESSON_WARNING_KEYS.yes)}
            onPress={onConfirm}
          >
            <Text>{t(PRIVATE_LESSON_WARNING_KEYS.yes)}</Text>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
