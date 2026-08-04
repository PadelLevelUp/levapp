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
import type { BlockedStudent } from "@/api/notificationEngine";

interface UnavailableStudentDialogProps {
  open: boolean;
  students: BlockedStudent[];
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * PAD-107: shown when a coach schedules a class into a window a selected
 * student has marked as unavailable.
 *
 * The coach may still proceed — enrolment is their call — but they are told up
 * front that no notification will reach that student for this slot, because the
 * student explicitly asked not to be disturbed then.
 */
export function UnavailableStudentDialog({
  open,
  students,
  onCancel,
  onConfirm,
}: UnavailableStudentDialogProps) {
  const { t } = useTranslation();
  const names = students.map((s) => s.name).filter(Boolean).join(", ");

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("calendar.unavailable.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("calendar.unavailable.description", {
              count: students.length,
              names,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            {t("calendar.unavailable.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {t("calendar.unavailable.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
