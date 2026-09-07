import { Ionicons } from "@expo/vector-icons";
import { joinTokensApi } from "@levelup/api";
import { lightTheme } from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Share, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { WEB_APP_URL } from "@/lib/config";
import { webAppLink } from "@/lib/web-links";

interface AddByQrSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * players.join-token rule 7 — the coach's "Add by QR" sheet on iOS.
 *
 * The QR is drawn on-device from the join URL. "Share" hands the link to the
 * system share sheet (which includes Copy — `expo-clipboard` is not a declared
 * dependency, and the sheet is the idiomatic iOS way to move a link anyway).
 * "Generate new code" rotates the token, the only way to retire a leaked one
 * (rule 6), hence the confirm.
 */
export function AddByQrSheet({ open, onOpenChange }: AddByQrSheetProps) {
  const { t, i18n } = useTranslation();
  const [token, setToken] = React.useState<joinTokensApi.CoachJoinToken | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = React.useState(false);

  const describeError = React.useCallback(
    (err: unknown) => {
      const res = (err as { response?: { status?: number; data?: { error?: string } } }).response;
      return res?.status === 409 && res.data?.error === "NO_CLUB"
        ? t("players.addByQr.noClub")
        : t("players.addByQr.failed");
    },
    [t]
  );

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const active = (await joinTokensApi.getJoinToken()) ?? (await joinTokensApi.mintJoinToken());
        if (!cancelled) setToken(active);
      } catch (err) {
        if (!cancelled) setError(describeError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, describeError]);

  const url = token ? webAppLink(WEB_APP_URL, token.path) : "";

  const handleShare = async () => {
    if (!url) return;
    try {
      await Share.share({ message: url, url });
    } catch {
      /* the user dismissed the sheet */
    }
  };

  const handleRotate = async () => {
    setConfirmRotate(false);
    setLoading(true);
    setError(null);
    try {
      setToken(await joinTokensApi.mintJoinToken());
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  };

  const expires = token
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(token.expiresAt)
      )
    : "";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent testID="add-by-qr-sheet">
          <DialogHeader>
            <DialogTitle>{t("players.addByQr.title")}</DialogTitle>
            <DialogDescription>{t("players.addByQr.description")}</DialogDescription>
          </DialogHeader>

          {loading ? (
            <View className="items-center py-8">
              <Spinner />
              <Text className="mt-2 text-sm text-muted-foreground">{t("players.addByQr.loading")}</Text>
            </View>
          ) : null}

          {!loading && error ? (
            <Text className="py-4 text-center text-sm text-destructive" testID="add-by-qr-error">
              {error}
            </Text>
          ) : null}

          {!loading && token ? (
            <View className="gap-3">
              <View className="items-center rounded-lg border border-border bg-white p-4">
                <QRCode value={url} size={200} />
              </View>
              <Text
                selectable
                className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-foreground"
                testID="add-by-qr-url"
              >
                {url}
              </Text>
              <Text className="text-xs text-muted-foreground" testID="add-by-qr-expires">
                {t("players.addByQr.expires", { date: expires })}
              </Text>
              <Button testID="add-by-qr-share" onPress={handleShare}>
                <View className="flex-row items-center gap-2">
                  <Ionicons name="share-outline" size={18} color={lightTheme.primaryForeground} />
                  <Text>{t("players.addByQr.share")}</Text>
                </View>
              </Button>
              <Button variant="ghost" testID="add-by-qr-rotate" onPress={() => setConfirmRotate(true)}>
                <Text>{t("players.addByQr.rotate")}</Text>
              </Button>
            </View>
          ) : null}

          <Button variant="outline" testID="add-by-qr-close" onPress={() => onOpenChange(false)}>
            <Text>{t("players.addByQr.cancel")}</Text>
          </Button>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmRotate} onOpenChange={setConfirmRotate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("players.addByQr.rotateConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("players.addByQr.rotateConfirmDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Text>{t("players.addByQr.cancel")}</Text>
            </AlertDialogCancel>
            <AlertDialogAction testID="add-by-qr-rotate-confirm" onPress={handleRotate}>
              <Text>{t("players.addByQr.rotateConfirm")}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
