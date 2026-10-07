import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { adminApi, ApiError, type AuditRow } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { statusTone } from "./UsersPage";

const KNOWN = ["REASON_REQUIRED", "NO_EMAIL", "ALREADY_VERIFIED", "RESEND_TOO_SOON"];

function Field({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="flex gap-3 border-t py-2 text-sm first:border-t-0" data-testid={testId}>
      <dt className="w-48 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

export function UserPage() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const operator = can("operator");
  const qc = useQueryClient();
  const userId = Number(useParams().userId);
  const key = ["admin", "user", userId];
  const user = useQuery({ queryKey: key, queryFn: () => adminApi.user(userId) });
  const [disabling, setDisabling] = useState(false);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "error" | "ok"; code: string; seconds?: number } | null>(null);

  const done = (code: string) => {
    setFeedback(code === "resent" ? { kind: "ok", code } : null);
    setDisabling(false);
    setReason("");
    void qc.invalidateQueries({ queryKey: key });
  };
  const fail = (err: unknown) => {
    const code = err instanceof ApiError && KNOWN.includes(err.code) ? err.code : "generic";
    setFeedback({ kind: "error", code, seconds: err instanceof ApiError ? err.retryAfterSeconds : undefined });
  };
  const disable = useMutation({ mutationFn: () => adminApi.disableUser(userId, reason.trim()), onSuccess: () => done("disabled"), onError: fail });
  const enable = useMutation({ mutationFn: () => adminApi.enableUser(userId), onSuccess: () => done("enabled"), onError: fail });
  const resend = useMutation({ mutationFn: () => adminApi.resendVerification(userId), onSuccess: () => done("resent"), onError: fail });
  const busy = disable.isPending || enable.isPending || resend.isPending;

  const back = (
    <Link to="/users" className="mb-4 inline-block text-sm text-primary hover:underline">
      {t("admin.user.back")}
    </Link>
  );
  if (user.isLoading) return <p className="text-sm text-muted-foreground">{t("admin.common.loading")}</p>;
  if (user.isError || !user.data) {
    const notFound = user.error instanceof ApiError && user.error.status === 404;
    return (
      <div>
        {back}
        <p className="text-sm text-destructive" data-testid="admin-user-error">
          {t(notFound ? "admin.user.notFound" : "admin.common.error")}
        </p>
      </div>
    );
  }
  const u = user.data;
  const yesNo = (v: boolean) => t(v ? "admin.user.yes" : "admin.user.no");

  return (
    <div>
      {back}
      <PageHeader title={u.name} lead={`@${u.username}`} />
      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold">{t("admin.user.account")}</h2>
        <dl data-testid="admin-user-details">
          <Field label={t("admin.users.columns.email")}>
            {u.email ?? "—"}{" "}
            <Badge tone={u.emailVerified ? "success" : "warning"}>{t(u.emailVerified ? "admin.users.verified" : "admin.users.unverified")}</Badge>
          </Field>
          <Field label={t("admin.users.columns.status")} testId="admin-user-status">
            <Badge tone={statusTone(u.status)}>{t(`admin.users.status.${u.status}`)}</Badge>
          </Field>
          <Field label={t("admin.users.columns.roles")}>{u.roles.map((r) => t(`admin.users.role.${r}`)).join(", ") || "—"}</Field>
          <Field label={t("admin.user.language")}>{u.language ?? "—"}</Field>
          <Field label={t("admin.user.created")}>{new Date(u.createdAt).toLocaleString(i18n.language)}</Field>
          <Field label={t("admin.user.push")}>{yesNo(u.pushRegistered)}</Field>
          <Field label={t("admin.user.superadmin")}>{yesNo(u.isSuperadmin)}</Field>
          {u.adminRole ? (
            <Field label={t("admin.user.consoleRole")} testId="admin-user-console-role">
              <Link to="/roles" className="text-primary hover:underline">
                {u.adminRole.role} ({u.adminRole.email})
              </Link>
            </Field>
          ) : null}
          {u.coach ? (
            <>
              <Field label={`${t("admin.user.coach")} · ${t("admin.user.approvalStatus")}`}>{u.coach.approvalStatus}</Field>
              {u.coach.rejectionReason ? <Field label={t("admin.user.rejectionReason")}>{u.coach.rejectionReason}</Field> : null}
              <Field label={t("admin.user.clubs")}>{u.coach.clubs.map((c) => c.name).join(", ") || t("admin.user.none")}</Field>
            </>
          ) : null}
          {u.player ? (
            <Field label={`${t("admin.user.player")} · ${t("admin.user.coaches")}`}>
              {u.player.coaches.map((c) => c.name).join(", ") || t("admin.user.none")}
            </Field>
          ) : null}
        </dl>
      </Card>

      {operator ? (
        <Card className="mb-6">
          <h2 className="mb-3 text-sm font-semibold">{t("admin.user.actions")}</h2>
          <div className="flex flex-wrap gap-2">
            {u.status === "disabled" ? (
              <Button variant="secondary" disabled={busy} onClick={() => enable.mutate()} data-testid="admin-user-enable">
                {t("admin.user.enable")}
              </Button>
            ) : (
              <Button variant="destructive" disabled={busy} onClick={() => { setDisabling(true); setFeedback(null); }} data-testid="admin-user-disable">
                {t("admin.user.disable")}
              </Button>
            )}
            <Button variant="secondary" disabled={busy} onClick={() => resend.mutate()} data-testid="admin-user-resend">
              {t("admin.user.resend")}
            </Button>
          </div>
          {disabling ? (
            <form
              className="mt-3 space-y-2 rounded-md bg-muted p-3"
              onSubmit={(e) => {
                e.preventDefault();
                disable.mutate();
              }}
              data-testid="admin-disable-form"
            >
              <label className="block text-xs text-muted-foreground">
                {t("admin.user.disableReason")}
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  className="mt-1 block w-full rounded-md border border-input bg-card p-2 text-sm"
                  data-testid="admin-disable-reason"
                />
              </label>
              <div className="flex gap-2">
                <Button type="submit" variant="destructive" disabled={busy || !reason.trim()} data-testid="admin-disable-confirm">
                  {t("admin.user.confirmDisable")}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setDisabling(false)}>
                  {t("admin.common.cancel")}
                </Button>
              </div>
            </form>
          ) : null}
          {feedback ? (
            <p
              className={feedback.kind === "ok" ? "mt-3 text-sm text-success-foreground" : "mt-3 text-sm text-destructive"}
              role={feedback.kind === "ok" ? "status" : "alert"}
              data-testid="admin-user-feedback"
            >
              {feedback.kind === "ok" ? t("admin.user.resent") : t(`admin.user.error.${feedback.code}`, { seconds: feedback.seconds ?? 0 })}
            </p>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <h2 className="mb-3 text-sm font-semibold">{t("admin.user.audit")}</h2>
        {u.audit.length === 0 ? <p className="text-sm text-muted-foreground">{t("admin.user.auditEmpty")}</p> : null}
        {u.audit.length > 0 ? (
          <table className="w-full text-sm" data-testid="admin-user-audit">
            <tbody>
              {u.audit.map((row: AuditRow) => (
                <tr key={row.id} className="border-t align-top">
                  <td className="py-2 pr-4 text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString(i18n.language)}</td>
                  <td className="py-2 pr-4">{row.actorEmail}</td>
                  <td className="py-2 pr-4 font-medium">{row.action}</td>
                  <td className="py-2">
                    <Badge tone={row.outcome === "ok" ? "success" : row.outcome === "denied" ? "warning" : "destructive"}>{t(`admin.audit.outcome.${row.outcome}`)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Card>
    </div>
  );
}
