import * as React from "react";
import { useTranslation } from "react-i18next";
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

/** Only the name is read from the API's blocked-student rows. */
export type BlockedStudentLike = { name?: string | null };

interface UnavailableStudentDialogProps {
  open: boolean;
  students: BlockedStudentLike[];
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Mobile port of web's `UnavailableStudentDialog.tsx` (PAD-107, ported by
 * PAD-159).
 *
 * Shown when a coach puts a student into a slot that student marked as
 * unavailable. Like web, it does not block: enrolment is the coach's call, but
 * they are told up front that no notification will reach that student for this
 * slot, because the student explicitly asked not to be disturbed then.
 *
 * Reuses web's `calendar.unavailable.*` copy, whose description is pluralized
 * on `count`.
 */
export function UnavailableStudentDialog({
  open,
  students,
  onCancel,
  onConfirm,
}: UnavailableStudentDialogProps) {
  const { t } = useTranslation();
  const names = students
    .map((s) => s.name)
    .filter((n): n is string => Boolean(n))
    .join(", ");

  return (
    <AlertDialog open={open} onOpenChange={(next) => (!next ? onCancel() : null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("calendar.unavailable.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("calendar.unavailable.description", {
              count: students.length,
              names,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            testID="unavailable-cancel"
            accessibilityLabel={t("calendar.unavailable.cancel")}
            onPress={onCancel}
          >
            <Text>{t("calendar.unavailable.cancel")}</Text>
          </AlertDialogCancel>
          <AlertDialogAction
            testID="unavailable-confirm"
            accessibilityLabel={t("calendar.unavailable.confirm")}
            onPress={onConfirm}
          >
            <Text>{t("calendar.unavailable.confirm")}</Text>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
