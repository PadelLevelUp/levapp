import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { PRIVATE_LESSON_WARNING_KEYS, classTypeChipKey } from "@levelup/config";
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

interface PrivateLessonWarningDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * PAD-929 (`classes.join-requests` rule 22): the question asked before a student joins a private
 * lesson. NÃO closes it and sends nothing; SIM lets the caller go on with `privateConfirmed: true`.
 * Who is asked is `needsPrivateLessonWarning` (@levelup/config). The title is for screen readers
 * only: the ticket's question is the body.
 */
export function PrivateLessonWarningDialog({ open, onCancel, onConfirm }: PrivateLessonWarningDialogProps) {
  const { t } = useTranslation();
  // Both buttons also close the dialog through `onOpenChange`; only a dismissal (Escape, outside) is a NÃO there.
  const answered = useRef(false);
  const answer = (fn: () => void) => () => {
    answered.current = true;
    fn();
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !answered.current) onCancel();
        answered.current = false;
      }}
    >
      <AlertDialogContent data-testid="private-lesson-warning">
        <AlertDialogHeader>
          <AlertDialogTitle className="sr-only">{t(classTypeChipKey("private")!)}</AlertDialogTitle>
          <AlertDialogDescription data-testid="private-lesson-warning-body">
            {t(PRIVATE_LESSON_WARNING_KEYS.body)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="private-lesson-warning-no" onClick={answer(onCancel)}>
            {t(PRIVATE_LESSON_WARNING_KEYS.no)}
          </AlertDialogCancel>
          <AlertDialogAction data-testid="private-lesson-warning-yes" onClick={answer(onConfirm)}>
            {t(PRIVATE_LESSON_WARNING_KEYS.yes)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
