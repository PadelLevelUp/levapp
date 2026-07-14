import { authApi } from "@levelup/api";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";

/**
 * App Store 5.1.1(v): in-app account deletion. Visible to all roles.
 *
 * Confirmation pattern mirrors the existing destructive flows in this app
 * (player remove in app/player/[playerId].tsx, message delete in
 * app/conversation/[id].tsx) — a single AlertDialog confirm, not a
 * type-to-confirm text input. There's no type-to-confirm precedent anywhere
 * in this codebase, and the dialog copy already states the action is
 * permanent and irreversible, so the two-step confirm is consistent with
 * how every other destructive action here is gated.
 */
export function DeleteAccountSection() {
  const { t } = useTranslation();
  const { logout } = useAuth();

  const [isDeleteOpen, setIsDeleteOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await authApi.deleteAccount();
      setIsDeleteOpen(false);
      toast.success(t("settings.account.deleteSuccess"));
      await logout();
    } catch {
      toast.error(t("settings.account.deleteFailed"));
      setIsDeleting(false);
    }
  };

  return (
    <Card testID="settings-account">
      <CardHeader>
        <CardTitle>{t("settings.account.title")}</CardTitle>
        <CardDescription>
          {t("settings.account.deleteAccountDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          variant="destructive"
          testID="settings-delete-account"
          accessibilityLabel={t("settings.account.deleteAccount")}
          onPress={() => setIsDeleteOpen(true)}
        >
          <Text>{t("settings.account.deleteAccount")}</Text>
        </Button>
      </CardContent>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.account.deleteDialogTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.account.deleteDialogDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              accessibilityLabel={t("common.cancel")}
              disabled={isDeleting}
            >
              <Text>{t("common.cancel")}</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              testID="delete-account-confirm"
              accessibilityLabel={t("settings.account.deleteConfirm")}
              className="bg-destructive"
              disabled={isDeleting}
              onPress={() => void handleConfirmDelete()}
            >
              <View className="flex-row items-center gap-2">
                {isDeleting ? <Spinner size="small" color="white" /> : null}
                <Text className="text-destructive-foreground">
                  {isDeleting
                    ? t("settings.account.deleting")
                    : t("settings.account.deleteConfirm")}
                </Text>
              </View>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
