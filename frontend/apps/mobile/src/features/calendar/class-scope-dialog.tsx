import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import * as React from "react";
import { View } from "react-native";
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

export type ApplyScope = "single" | "future";
export type ClassScopeMode = "delete" | "edit";

interface ClassScopeDialogProps {
  open: boolean;
  mode: ClassScopeMode;
  onClose: () => void;
  onConfirm: (scope: ApplyScope) => void;
}

/** Ports web's ClassScopeDialog.tsx: lets the coach choose whether an edit
 * or delete on a recurring class applies to just this instance or to this
 * and all future ones. */
export function ClassScopeDialog({
  open,
  mode,
  onClose,
  onConfirm,
}: ClassScopeDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(`calendar.scope.${mode}.title`)}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(`calendar.scope.${mode}.description`)}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <View className="gap-3">
          <AlertDialogAction
            testID="class-scope-single"
            accessibilityLabel={t(`calendar.scope.${mode}.singleTitle`)}
            className="h-auto flex-row items-start justify-start gap-3 border border-input bg-background p-4 active:bg-accent"
            onPress={() => onConfirm("single")}
          >
            <Ionicons
              name="calendar-outline"
              size={20}
              color={lightTheme.foreground}
            />
            <View className="flex-1 gap-0.5">
              <Text className="font-medium text-foreground">
                {t(`calendar.scope.${mode}.singleTitle`)}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {t(`calendar.scope.${mode}.singleDescription`)}
              </Text>
            </View>
          </AlertDialogAction>

          <AlertDialogAction
            testID="class-scope-future"
            accessibilityLabel={t(`calendar.scope.${mode}.futureTitle`)}
            className="h-auto flex-row items-start justify-start gap-3 border border-input bg-background p-4 active:bg-accent"
            onPress={() => onConfirm("future")}
          >
            <Ionicons name="repeat" size={20} color={lightTheme.foreground} />
            <View className="flex-1 gap-0.5">
              <Text className="font-medium text-foreground">
                {t(`calendar.scope.${mode}.futureTitle`)}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {t(`calendar.scope.${mode}.futureDescription`)}
              </Text>
            </View>
          </AlertDialogAction>
        </View>

        <AlertDialogFooter>
          <AlertDialogCancel accessibilityLabel={t("calendar.scope.cancel")}>
            <Text>{t("common.cancel")}</Text>
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
