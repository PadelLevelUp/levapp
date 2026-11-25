import * as React from "react";
import { ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import type { CalendarEvent } from "@levelup/types";
import type { CancelReason } from "@levelup/api/src/resources/classes";
import { useCancelReason } from "@levelup/hooks";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Text } from "@/components/ui/text";
import { CancelReasonFields } from "./cancel-reason-fields";

interface ClassDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: CalendarEvent | null | undefined;
  title: string;
  isRecurring: boolean;
  /** PAD-335 (classes.delete rule 7): attendance was marked, so it goes with the class. */
  attendanceRecorded: boolean;
  onConfirm: (scope: "single" | "future", cancel?: CancelReason) => void;
}

/**
 * The delete confirmation (scope choice for recurring classes) with the cancellation's reason
 * (classes.delete rule 12, PAD-840). The shared dialog, because it holds a text field and only that one
 * sits above the keyboard (mobile.android-runtime rule 15); the fields scroll, so the buttons stay on it.
 */
export function ClassDeleteDialog({
  open,
  onOpenChange,
  event,
  title,
  isRecurring,
  attendanceRecorded,
  onConfirm,
}: ClassDeleteDialogProps) {
  const { t } = useTranslation();
  const cancelReason = useCancelReason(event, open);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("calendar.deleteDialog.title")}</DialogTitle>
          <DialogDescription>
            {isRecurring
              ? t("classDetail.deleteRecurringDescription")
              : t("classDetail.deleteSingleDescription", { title })}
          </DialogDescription>
          {attendanceRecorded ? (
            <Text testID="delete-attendance-note" className="text-sm font-medium text-destructive">
              {t("calendar.detail.deleteAttendanceNote")}
            </Text>
          ) : null}
        </DialogHeader>
        <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
          <CancelReasonFields state={cancelReason} />
        </ScrollView>
        <DialogFooter>
          {isRecurring ? (
            <>
              <Button
                testID="class-delete-confirm"
                accessibilityLabel={t("classDetail.deleteOnlyThisAria")}
                variant="destructive"
                onPress={() => onConfirm("single", cancelReason.cancel)}
              >
                <Text>{t("calendar.deleteDialog.singleTitle")}</Text>
              </Button>
              <Button
                testID="class-delete-confirm-future"
                accessibilityLabel={t("classDetail.deleteFutureAria")}
                variant="destructive"
                onPress={() => onConfirm("future", cancelReason.cancel)}
              >
                <Text>{t("calendar.deleteDialog.futureTitle")}</Text>
              </Button>
            </>
          ) : (
            <Button
              testID="class-delete-confirm"
              accessibilityLabel={t("classDetail.confirmDeleteAria")}
              variant="destructive"
              onPress={() => onConfirm("single", cancelReason.cancel)}
            >
              <Text>{t("calendar.detail.delete")}</Text>
            </Button>
          )}
          <Button testID="class-delete-cancel" variant="outline" onPress={() => onOpenChange(false)}>
            <Text>{t("common.cancel")}</Text>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
