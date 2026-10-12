import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { adminApi, ApiError, type ReportAction } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { MessageText } from "./ReportsPage";

const ACTIONS: { action: ReportAction; label: string; testId: string; needsNote: boolean }[] = [
  { action: "dismiss", label: "dismiss", testId: "report-dismiss", needsNote: false },
  { action: "delete-message", label: "deleteMessage", testId: "report-delete-message", needsNote: false },
  { action: "disable-author", label: "disableAuthor", testId: "report-disable-author", needsNote: true },
];

function Field({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="flex gap-3 border-t py-2 text-sm first:border-t-0" data-testid={testId}>
      <dt className="w-32 shrink-0 text-muted-foreground md:w-48">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
    </div>
  );
}

/**
 * admin.moderation rules 3, 4 and 7 (PAD-631): one report with the message in context and the three
 * actions. Actions are the operator's (support reads); each asks first, and disabling the author
 * needs a note. The report is re-read after an action, and after a 409 (someone else closed it).
 */
export function ReportPage() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const operator = can("operator");
  const qc = useQueryClient();
  const reportId = Number(useParams().reportId);
  const key = ["admin", "report", reportId];
  const report = useQuery({ queryKey: key, queryFn: () => adminApi.report(reportId) });
  const [pending, setPending] = useState<(typeof ACTIONS)[number] | null>(null);
  // The inline confirmation behaves as a dialog: focus moves into it on open, Escape cancels, and
  // focus returns to the action that opened it.
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (pending) noteRef.current?.focus();
  }, [pending]);
  const cancel = () => {
    setPending(null);
    trigger.current?.focus();
  };
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<"alreadyHandled" | "error" | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key });
    void qc.invalidateQueries({ queryKey: ["admin", "reports"] });
    void qc.invalidateQueries({ queryKey: ["admin", "reports-summary"] });
  };
  const act = useMutation({
    mutationFn: (a: (typeof ACTIONS)[number]) => adminApi.actOnReport(reportId, a.action, note.trim() || undefined),
    onSuccess: () => {
      setFeedback(null);
      setPending(null);
      setNote("");
      refresh();
    },
    onError: (err) => {
      const closed = err instanceof ApiError && err.status === 409;
      setFeedback(closed ? "alreadyHandled" : "error");
      setPending(null);
      setNote("");
      if (closed) refresh();
    },
  });

  const back = (
    <Link to="/reports" className="mb-4 inline-flex min-h-11 items-center text-sm text-primary hover:underline md:min-h-0">
      {t("admin.report.back")}
    </Link>
  );
  if (report.isLoading) return <p className="text-sm text-muted-foreground">{t("admin.common.loading")}</p>;
  if (report.isError || !report.data) {
    const notFound = report.error instanceof ApiError && report.error.status === 404;
    return (
      <div>
        {back}
        <p className="text-sm text-destructive" data-testid="report-error">
          {t(notFound ? "admin.report.notFound" : "admin.common.error")}
        </p>
      </div>
    );
  }
  const r = report.data;
  const when = (iso: string) => new Date(iso).toLocaleString(i18n.language);

  const noteBlocks = !!pending?.needsNote && !note.trim();

  return (
    <div>
      {back}
      <PageHeader title={t("admin.report.title", { id: r.id })} lead={r.reason ?? t("admin.reports.noReason")} />
      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold">{t("admin.report.facts")}</h2>
        <dl data-testid="report-details">
          <Field label={t("admin.reports.columns.created")}>{when(r.createdAt)}</Field>
          <Field label={t("admin.reports.columns.reason")}>{r.reason ?? t("admin.reports.noReason")}</Field>
          <Field label={t("admin.reports.columns.message")}><MessageText message={r.message} /></Field>
          <Field label={t("admin.reports.columns.author")}>{r.author?.name ?? t("admin.reports.unknownAuthor")}</Field>
          <Field label={t("admin.reports.columns.reporter")}>{r.reporter.name}</Field>
          <Field label={t("admin.reports.tabs." + r.status)} testId="report-status">
            <Badge tone={r.status === "open" ? "warning" : "muted"}>{t(`admin.reports.status.${r.status}`)}</Badge>
          </Field>
          {r.status === "closed" ? (
            <>
              <Field label={t("admin.reports.columns.outcome")} testId="report-outcome">
                <span data-testid="report-outcome-value">{r.outcome ? t(`admin.reports.outcome.${r.outcome}`) : "—"}</span>
              </Field>
              <Field label={t("admin.reports.columns.closedBy")}>
                {r.closedBy ?? "—"}
                {r.closedAt ? ` · ${when(r.closedAt)}` : ""}
              </Field>
            </>
          ) : null}
        </dl>
      </Card>

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold">{t("admin.report.context")}</h2>
        {r.context.length === 0 ? <p className="text-sm text-muted-foreground">{t("admin.report.contextEmpty")}</p> : null}
        <ol className="space-y-2" data-testid="report-context">
          {r.context.map((m) => (
            <li
              key={m.id}
              data-testid={`report-context-${m.id}`}
              data-reported={m.reported ? "true" : "false"}
              className={clsx("rounded-md border p-3 text-sm", m.reported && "border-destructive bg-destructive/10")}
            >
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{m.senderName ?? "—"}</span>
                <span>{when(m.sentAt)}</span>
                {m.reported ? <Badge tone="destructive">{t("admin.report.reportedMarker")}</Badge> : null}
                {m.deleted ? <Badge>{t("admin.report.deletedMarker")}</Badge> : null}
              </div>
              <span className={clsx("break-words", m.deleted && "line-through text-muted-foreground")}>{m.text}</span>
            </li>
          ))}
        </ol>
      </Card>

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold">{t("admin.report.participants")}</h2>
        <ul className="space-y-1" data-testid="report-participants">
          {r.participants.map((p) => (
            <li key={p.id}>
              <Link to={`/users/${p.id}`} className="inline-flex min-h-11 items-center text-sm text-primary hover:underline md:min-h-0" data-testid={`report-participant-${p.id}`}>
                {p.name} <span className="ml-1 text-xs text-muted-foreground">@{p.username}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      {operator || feedback ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold">{t("admin.report.actions")}</h2>
          {operator && r.status === "open" ? (
            <div className="flex flex-wrap gap-2">
              {ACTIONS.map((a) => (
                <Button
                  key={a.action}
                  variant={a.action === "dismiss" ? "secondary" : "destructive"}
                  disabled={act.isPending}
                  onClick={(e) => {
                    trigger.current = e.currentTarget;
                    setPending(a);
                    setNote("");
                    setFeedback(null);
                  }}
                  data-testid={a.testId}
                >
                  {t(`admin.report.${a.label}`)}
                </Button>
              ))}
            </div>
          ) : operator ? (
            <p className="text-sm text-muted-foreground">{t("admin.report.closedNotice")}</p>
          ) : null}
          {pending && r.status === "open" ? (
            <form
              role="dialog"
              aria-label={t(`admin.report.${pending.label}`)}
              className="mt-3 space-y-2 rounded-md bg-muted p-3"
              data-testid="report-confirm-form"
              onKeyDown={(e) => {
                if (e.key === "Escape") cancel();
              }}
              onSubmit={(e) => {
                e.preventDefault();
                if (!noteBlocks) act.mutate(pending);
              }}
            >
              <p className="text-sm">{t(`admin.report.confirm.${pending.action}`)}</p>
              <label className="block text-xs text-muted-foreground">
                {pending.needsNote ? t("admin.report.noteRequired") : t("admin.report.noteOptional")}
                <textarea
                  ref={noteRef}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  className="mt-1 block w-full rounded-md border border-input bg-card p-2 text-sm"
                  data-testid="report-note"
                />
              </label>
              <div className="flex gap-2">
                <Button type="submit" variant="destructive" disabled={act.isPending || noteBlocks} data-testid="report-confirm">
                  {t("admin.report.confirmAction")}
                </Button>
                <Button type="button" variant="ghost" onClick={cancel} data-testid="report-cancel">
                  {t("admin.common.cancel")}
                </Button>
              </div>
            </form>
          ) : null}
          {feedback ? (
            <p className="mt-3 text-sm text-destructive" role="alert" data-testid="report-feedback">
              {t(`admin.report.${feedback}`)}
            </p>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
