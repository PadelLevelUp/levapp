import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Loader2, RefreshCw } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { getJoinToken, mintJoinToken, type CoachJoinToken } from "@/api/joinTokens";

interface AddByQrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * players.join-token rule 7 — the coach's "Add by QR" dialog.
 *
 * The QR is rendered client-side from the join URL (nothing is stored server
 * side beyond the token). Opening the dialog reads the active token and mints
 * one when there is none; "Generate new code" rotates it, which is the only
 * way to retire a leaked link (rule 6), hence the confirm.
 */
export function AddByQrDialog({ open, onOpenChange }: AddByQrDialogProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [token, setToken] = useState<CoachJoinToken | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);

  const describeError = useCallback(
    (err: unknown) => {
      const data = (err as { response?: { status?: number; data?: { error?: string } } }).response;
      return data?.status === 409 && data.data?.error === "NO_CLUB"
        ? t("players.addByQr.noClub")
        : t("players.addByQr.failed");
    },
    [t]
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const active = (await getJoinToken()) ?? (await mintJoinToken());
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

  const url = token ? `${window.location.origin}${token.path}` : "";

  const handleCopy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: t("players.addByQr.copied") });
    } catch {
      toast({ variant: "destructive", title: t("players.addByQr.copyFailed") });
    }
  };

  const handleRotate = async () => {
    setConfirmRotate(false);
    setLoading(true);
    setError(null);
    try {
      setToken(await mintJoinToken());
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
        <DialogContent data-testid="add-by-qr-dialog">
          <DialogHeader>
            <DialogTitle>{t("players.addByQr.title")}</DialogTitle>
            <DialogDescription>{t("players.addByQr.description")}</DialogDescription>
          </DialogHeader>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("players.addByQr.loading")}
            </div>
          )}

          {!loading && error && (
            <p className="py-6 text-center text-sm text-destructive" data-testid="add-by-qr-error">
              {error}
            </p>
          )}

          {!loading && token && (
            <div className="space-y-4">
              <div className="flex justify-center rounded-lg border border-border bg-white p-4">
                <QRCodeSVG value={url} size={208} level="M" data-testid="add-by-qr-code" />
              </div>
              <div className="flex items-center gap-2">
                <Input readOnly value={url} data-testid="add-by-qr-url" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  aria-label={t("players.addByQr.copy")}
                  data-testid="add-by-qr-copy"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground" data-testid="add-by-qr-expires">
                {t("players.addByQr.expires", { date: expires })}
              </p>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setConfirmRotate(true)}
                data-testid="add-by-qr-rotate"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {t("players.addByQr.rotate")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmRotate} onOpenChange={setConfirmRotate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("players.addByQr.rotateConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("players.addByQr.rotateConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("players.addByQr.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRotate} data-testid="add-by-qr-rotate-confirm">
              {t("players.addByQr.rotateConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
