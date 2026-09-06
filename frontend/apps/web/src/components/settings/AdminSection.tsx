import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Check, Loader2, X } from "lucide-react";
import {
  type PendingCoach,
  approveCoach,
  listPendingCoaches,
  rejectCoach,
} from "@/api/admin";

/**
 * auth.coach-approval rule 7 — the LevApp admin's list of coaches waiting for
 * approval. Rendered only for `isSuperAdmin` (SettingsPage gates the section);
 * the endpoints behind it are superadmin-only server-side, so this is
 * presentation, not the boundary.
 */
export function AdminSection({ onCountChange }: { onCountChange?: (n: number) => void }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingCoach[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<PendingCoach | null>(null);
  const [reason, setReason] = useState("");

  const refresh = useCallback(async () => {
    try {
      const rows = await listPendingCoaches();
      setPending(rows);
      onCountChange?.(rows.length);
    } catch {
      toast({ variant: "destructive", title: t("settings.admin.loadFailed") });
    } finally {
      setLoading(false);
    }
  }, [onCountChange, t, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleApprove = async (coach: PendingCoach) => {
    setBusyId(coach.coachId);
    try {
      await approveCoach(coach.coachId);
      toast({ title: t("settings.admin.approved", { name: coach.name }) });
      await refresh();
    } catch {
      toast({ variant: "destructive", title: t("settings.admin.actionFailed") });
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async () => {
    if (!rejecting) return;
    setBusyId(rejecting.coachId);
    try {
      await rejectCoach(rejecting.coachId, reason.trim() || undefined);
      toast({ title: t("settings.admin.rejected", { name: rejecting.name }) });
      setRejecting(null);
      setReason("");
      await refresh();
    } catch {
      toast({ variant: "destructive", title: t("settings.admin.actionFailed") });
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="admin-coach-approvals">
      <div>
        <h3 className="font-medium">{t("settings.admin.pendingCoaches")}</h3>
        <p className="text-sm text-muted-foreground">{t("settings.admin.pendingCoachesDescription")}</p>
      </div>

      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="admin-no-pending">
          {t("settings.admin.noPending")}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {pending.map((coach) => (
            <li
              key={coach.coachId}
              className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
              data-testid={`admin-pending-${coach.username}`}
            >
              <div className="min-w-0">
                <p className="font-medium">{coach.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  @{coach.username}
                  {coach.email ? ` · ${coach.email}` : ""}
                  {" · "}
                  {new Date(coach.requestedAt).toLocaleDateString(i18n.language)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  className="gap-1"
                  disabled={busyId === coach.coachId}
                  onClick={() => void handleApprove(coach)}
                  data-testid={`admin-approve-${coach.username}`}
                >
                  <Check className="h-4 w-4" />
                  {t("settings.admin.approve")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  disabled={busyId === coach.coachId}
                  onClick={() => setRejecting(coach)}
                  data-testid={`admin-reject-${coach.username}`}
                >
                  <X className="h-4 w-4" />
                  {t("settings.admin.reject")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={rejecting !== null} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("settings.admin.rejectDialogTitle", { name: rejecting?.name ?? "" })}</DialogTitle>
            <DialogDescription>{t("settings.admin.rejectDialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="admin-reject-reason">{t("settings.admin.reason")}</Label>
            <Input
              id="admin-reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("settings.admin.reasonPlaceholder")}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              disabled={busyId !== null}
              onClick={() => void handleReject()}
              data-testid="admin-reject-confirm"
            >
              {t("settings.admin.reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
