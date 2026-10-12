import { keepPreviousData, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { adminApi, type ReportRow, type ReportStatus } from "@/lib/api";
import { useIsPhone } from "@/lib/useIsPhone";

/** A message text; a deleted one is struck through and labelled. Staff always see the whole text. */
export function MessageText({ message }: { message: ReportRow["message"] }) {
  const { t } = useTranslation();
  return (
    <>
      <span className={clsx("break-words", message.deleted && "line-through text-muted-foreground")}>{message.text}</span>
      {message.deleted ? <span className="ml-1 text-xs text-muted-foreground">({t("admin.reports.deleted")})</span> : null}
    </>
  );
}

function Outcome({ row }: { row: ReportRow }) {
  const { t } = useTranslation();
  return row.outcome ? <Badge tone="primary">{t(`admin.reports.outcome.${row.outcome}`)}</Badge> : <>—</>;
}

/** admin.moderation rules 2 and 7 (PAD-631): every reported message, Open or Closed, newest first. */
export function ReportsPage() {
  const { t, i18n } = useTranslation();
  const phone = useIsPhone();
  const [status, setStatus] = useState<ReportStatus>("open");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["admin", "reports", status, page],
    queryFn: () => adminApi.reports(status, page),
    placeholderData: keepPreviousData,
  });
  const items = query.data?.items ?? [];
  const when = (iso: string) => new Date(iso).toLocaleString(i18n.language);
  const pick = (next: ReportStatus) => {
    setStatus(next);
    setPage(1);
  };

  return (
    <div>
      <PageHeader title={t("admin.reports.title")} lead={t("admin.reports.lead")} />
      <div className="mb-4 flex gap-2" role="tablist">
        {(["open", "closed"] as const).map((s) => (
          <Button
            key={s}
            role="tab"
            aria-selected={status === s}
            variant={status === s ? "primary" : "secondary"}
            onClick={() => pick(s)}
            data-testid={`reports-tab-${s}`}
          >
            {t(`admin.reports.tabs.${s}`)}
          </Button>
        ))}
      </div>
      <Card>
        {query.isLoading ? <p className="text-sm text-muted-foreground">{t("admin.common.loading")}</p> : null}
        {query.isError ? <p className="text-sm text-destructive">{t("admin.common.error")}</p> : null}
        {query.data && items.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="reports-empty">{t("admin.reports.empty")}</p> : null}
        {items.length > 0 && phone ? (
          // admin.phone-console rule 3: one card per report, the message is the tappable primary action.
          <ul className="space-y-3" data-testid="reports-table">
            {items.map((r) => (
              <li key={r.id} className="rounded-lg border bg-card p-4 text-sm" data-testid={`report-row-${r.id}`}>
                <Link to={`/reports/${r.id}`} className="flex min-h-11 items-center font-medium text-primary hover:underline" data-testid={`report-link-${r.id}`}>
                  <MessageText message={r.message} />
                </Link>
                <dl className="mt-2 space-y-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("admin.reports.columns.created")}</dt>
                    <dd>{when(r.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("admin.reports.columns.reason")}</dt>
                    <dd className="break-words">{r.reason ?? t("admin.reports.noReason")}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("admin.reports.columns.author")}</dt>
                    <dd className="break-words">{r.author?.name ?? t("admin.reports.unknownAuthor")}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{t("admin.reports.columns.reporter")}</dt>
                    <dd className="break-words">{r.reporter.name}</dd>
                  </div>
                  {r.status === "closed" ? (
                    <>
                      <div>
                        <dt className="text-xs text-muted-foreground">{t("admin.reports.columns.outcome")}</dt>
                        <dd><Outcome row={r} /></dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">{t("admin.reports.columns.closedBy")}</dt>
                        <dd className="break-words">{r.closedBy ?? "—"}</dd>
                      </div>
                    </>
                  ) : null}
                </dl>
              </li>
            ))}
          </ul>
        ) : null}
        {items.length > 0 && !phone ? (
          <table className="w-full text-sm" data-testid="reports-table">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                {["created", "reason", "message", "author", "reporter", ...(status === "closed" ? ["outcome", "closedBy"] : [])].map((c) => (
                  <th key={c} className="pb-2 pr-4 font-medium">{t(`admin.reports.columns.${c}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-t align-top" data-testid={`report-row-${r.id}`}>
                  <td className="py-2 pr-4 whitespace-nowrap text-xs">{when(r.createdAt)}</td>
                  <td className="py-2 pr-4">{r.reason ?? "—"}</td>
                  <td className="py-2 pr-4 font-medium">
                    <Link to={`/reports/${r.id}`} className="text-primary hover:underline" data-testid={`report-link-${r.id}`}>
                      <MessageText message={r.message} />
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{r.author?.name ?? t("admin.reports.unknownAuthor")}</td>
                  <td className="py-2 pr-4">{r.reporter.name}</td>
                  {r.status === "closed" ? (
                    <>
                      <td className="py-2 pr-4"><Outcome row={r} /></td>
                      <td className="py-2 pr-4">{r.closedBy ?? "—"}</td>
                    </>
                  ) : status === "closed" ? (
                    <td colSpan={2} />
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} data-testid="reports-prev">
            {t("admin.reports.prev")}
          </Button>
          <span>{t("admin.reports.page", { page })}</span>
          <Button variant="ghost" disabled={!query.data?.hasMore} onClick={() => setPage((p) => p + 1)} data-testid="reports-next">
            {t("admin.reports.next")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
