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

interface OverlapConfirmDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Mobile port of web's `OverlapConfirmDialog.tsx` (PAD-99, ported by PAD-159).
 *
 * Shown when the class being created or edited overlaps one that already
 * exists. Deliberately NON-blocking, exactly as on web: a coach may genuinely
 * want two things at once, so this warns and lets them proceed rather than
 * refusing the save. It reuses web's `calendar.overlap.*` copy so the two
 * platforms say the same thing.
 */
export function OverlapConfirmDialog({
  open,
  onCancel,
  onConfirm,
}: OverlapConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={(next) => (!next ? onCancel() : null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("calendar.overlap.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("calendar.overlap.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            testID="overlap-cancel"
            accessibilityLabel={t("calendar.overlap.cancel")}
            onPress={onCancel}
          >
            <Text>{t("calendar.overlap.cancel")}</Text>
          </AlertDialogCancel>
          <AlertDialogAction
            testID="overlap-confirm"
            accessibilityLabel={t("calendar.overlap.confirm")}
            onPress={onConfirm}
          >
            <Text>{t("calendar.overlap.confirm")}</Text>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
