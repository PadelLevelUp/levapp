import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { adminApi, ApiError, type PendingCoach } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export const APPROVALS_KEY = ["admin", "coach-approvals"];

export function ApprovalsPage() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const operator = can("operator");
  const qc = useQueryClient();
  const list = useQuery({ queryKey: APPROVALS_KEY, queryFn: adminApi.coachApprovals });
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<"alreadyDecided" | "error" | null>(null);

  const onDone = () => {
    setNotice(null);
    setRejecting(null);
    setReason("");
    void qc.invalidateQueries({ queryKey: APPROVALS_KEY });
  };
  const onFail = (err: unknown) => {
    // Any 410 means somebody else decided first (the proxy may answer with an HTML body).
    setNotice(err instanceof ApiError && err.status === 410 ? "alreadyDecided" : "error");
    setRejecting(null);
    void qc.invalidateQueries({ queryKey: APPROVALS_KEY });
  };
  const approve = useMutation({ mutationFn: (id: number) => adminApi.approveCoach(id), onSuccess: onDone, onError: onFail });
  const reject = useMutation({ mutationFn: (id: number) => adminApi.rejectCoach(id, reason.trim() || undefined), onSuccess: onDone, onError: onFail });
  const busy = approve.isPending || reject.isPending;

  return (
    <div>
      <PageHeader title={t("admin.approvals.title")} lead={t("admin.approvals.lead")} />
      {notice ? (
        <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert" data-testid="admin-approvals-notice">
          {t(notice === "alreadyDecided" ? "admin.approvals.alreadyDecided" : "admin.approvals.error")}
        </p>
      ) : null}
      <Card>
        {list.isLoading ? <p className="text-sm text-muted-foreground">{t("admin.common.loading")}</p> : null}
        {list.isError ? <p className="text-sm text-destructive">{t("admin.common.error")}</p> : null}
        {list.data && list.data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="admin-approvals-empty">
            {t("admin.approvals.empty")}
          </p>
        ) : null}
        {list.data && list.data.items.length > 0 ? (
          <ul data-testid="admin-approvals-list">
            {list.data.items.map((c: PendingCoach) => (
              <li key={c.coachId} className="border-t py-3 first:border-t-0" data-testid={`admin-approval-${c.coachId}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="w-full min-w-0 break-words md:w-auto md:flex-1">
                    <div className="font-medium">
                      {c.name} <span className="font-normal text-muted-foreground">@{c.username}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.email ?? "—"}
                      {c.requestedAt ? ` · ${t("admin.approvals.requested", { when: new Date(c.requestedAt).toLocaleString(i18n.language) })}` : ""}
                    </div>
                  </div>
                  {!c.emailVerified ? (
                    <span data-testid={`admin-approval-unverified-${c.coachId}`}>
                      <Badge tone="warning">{t("admin.approvals.unverified")}</Badge>
                    </span>
                  ) : null}
                  {operator ? (
                    <div className="flex w-full gap-2 md:w-auto">
                      <Button className="flex-1 md:flex-none" disabled={busy} onClick={() => approve.mutate(c.coachId)} data-testid={`admin-approve-${c.coachId}`}>
                        {t("admin.approvals.approve")}
                      </Button>
                      <Button variant="destructive" className="flex-1 md:flex-none" disabled={busy} onClick={() => { setRejecting(c.coachId); setReason(""); }} data-testid={`admin-reject-${c.coachId}`}>
                        {t("admin.approvals.reject")}
                      </Button>
                    </div>
                  ) : null}
                </div>
                {operator && rejecting === c.coachId ? (
                  <form
                    className="mt-3 space-y-2 rounded-md bg-muted p-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      reject.mutate(c.coachId);
                    }}
                    data-testid="admin-reject-form"
                  >
                    <p className="text-sm font-medium">{t("admin.approvals.rejectTitle", { name: c.name })}</p>
                    <label className="block text-xs text-muted-foreground">
                      {t("admin.approvals.reason")}
                      <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-input bg-card p-2 text-sm"
                        rows={2}
                        data-testid="admin-reject-reason"
                      />
                    </label>
                    <div className="flex gap-2">
                      <Button type="submit" variant="destructive" className="flex-1 md:flex-none" disabled={busy} data-testid="admin-reject-confirm">
                        {t("admin.approvals.confirmReject")}
                      </Button>
                      <Button type="button" variant="ghost" className="flex-1 md:flex-none" onClick={() => setRejecting(null)} data-testid="admin-reject-cancel">
                        {t("admin.common.cancel")}
                      </Button>
                    </div>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>
    </div>
  );
}
