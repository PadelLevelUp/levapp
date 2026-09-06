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
  /**
   * i18n namespace the six strings come from. Defaults to the class-worded
   * `calendar.scope` ("Eliminar aula"); a personal calendar event passes
   * `calendar.eventScope` so the same dialog reads "Eliminar evento". Same
   * prop, same default, as web's ClassScopeDialog.tsx.
   */
  keyPrefix?: string;
}

/** Ports web's ClassScopeDialog.tsx: lets the coach choose whether an edit
 * or delete on a recurring class applies to just this instance or to this
 * and all future ones. */
export function ClassScopeDialog({
  open,
  mode,
  onClose,
  onConfirm,
  keyPrefix = "calendar.scope",
}: ClassScopeDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={(next) => (!next ? onClose() : null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(`${keyPrefix}.${mode}.title`)}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(`${keyPrefix}.${mode}.description`)}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <View className="gap-3">
          <AlertDialogAction
            testID="class-scope-single"
            accessibilityLabel={t(`${keyPrefix}.${mode}.singleTitle`)}
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
                {t(`${keyPrefix}.${mode}.singleTitle`)}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {t(`${keyPrefix}.${mode}.singleDescription`)}
              </Text>
            </View>
          </AlertDialogAction>

          <AlertDialogAction
            testID="class-scope-future"
            accessibilityLabel={t(`${keyPrefix}.${mode}.futureTitle`)}
            className="h-auto flex-row items-start justify-start gap-3 border border-input bg-background p-4 active:bg-accent"
            onPress={() => onConfirm("future")}
          >
            <Ionicons name="repeat" size={20} color={lightTheme.foreground} />
            <View className="flex-1 gap-0.5">
              <Text className="font-medium text-foreground">
                {t(`${keyPrefix}.${mode}.futureTitle`)}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {t(`${keyPrefix}.${mode}.futureDescription`)}
              </Text>
            </View>
          </AlertDialogAction>
        </View>

        <AlertDialogFooter>
          <AlertDialogCancel accessibilityLabel={t(`${keyPrefix}.cancel`)}>
            <Text>{t("common.cancel")}</Text>
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
