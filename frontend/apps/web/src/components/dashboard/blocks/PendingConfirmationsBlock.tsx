import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BellRing, Loader2, Send } from "lucide-react";

import type { DashboardPendingConfirmationsBlock } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/hooks/use-toast";
import { notifyPendingConfirmations } from "@/api/dashboard";

/**
 * PAD-78: replaces the old coach "Revenue" KPI. Shows how many students are
 * still pending confirmation for tomorrow's classes and lets the coach fire an
 * extra manual reminder to exactly those students (never to anyone who already
 * confirmed or declined).
 */
export function PendingConfirmationsBlock({
  block,
}: {
  block: DashboardPendingConfirmationsBlock;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const { count, canNotify } = block.data;

  const handleConfirm = async () => {
    setSending(true);
    try {
      const result = await notifyPendingConfirmations();
      toast({
        title: t("dashboard.pending.notifySuccess", { count: result.sent }),
      });
      setOpen(false);
    } catch {
      toast({
        title: t("dashboard.pending.notifyError"),
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card data-testid="dashboard-pending-confirmations">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {t("dashboard.pending.title")}
        </CardTitle>
        <BellRing className="w-4 h-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="flex items-end justify-between gap-4">
        <div>
          <div className="text-2xl font-bold" data-testid="dashboard-pending-count">
            {count}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {t("dashboard.pending.subtitle")}
          </p>
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!canNotify || sending}
          onClick={() => setOpen(true)}
          data-testid="dashboard-notify-button"
        >
          {sending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Send className="w-4 h-4 mr-2" />
          )}
          {t("dashboard.pending.notifyButton")}
        </Button>
      </CardContent>

      <AlertDialog open={open} onOpenChange={(o) => !sending && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dashboard.pending.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("dashboard.pending.confirmDescription", { count })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirm();
              }}
              disabled={sending}
            >
              {sending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              {t("dashboard.pending.confirmAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
