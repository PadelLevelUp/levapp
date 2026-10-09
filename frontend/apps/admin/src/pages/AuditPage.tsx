import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Badge, Button, Card, Input, PageHeader } from "@/components/ui";
import { ScrollTable } from "@/components/ScrollTable";
import { adminApi, type AuditRow } from "@/lib/api";

const EMPTY = { actorEmail: "", action: "", targetType: "", targetId: "" };

function Change({ row }: { row: AuditRow }) {
  if (row.before == null && row.after == null) return <span className="text-muted-foreground">—</span>;
  return (
    <code className="block max-w-md whitespace-pre-wrap break-words text-xs">
      {row.before != null ? JSON.stringify(row.before) : "∅"} → {row.after != null ? JSON.stringify(row.after) : "∅"}
    </code>
  );
}

export function AuditPage() {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState(EMPTY);
  const [filters, setFilters] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["admin", "audit", filters, page],
    queryFn: () => adminApi.audit({ ...filters, page: String(page) }),
    placeholderData: keepPreviousData,
  });
  const tone = (outcome: AuditRow["outcome"]) => (outcome === "ok" ? "success" : outcome === "denied" ? "warning" : "destructive");

  return (
    <div>
      <PageHeader title={t("admin.audit.title")} lead={t("admin.audit.lead")} />
      <Card className="mb-6">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setFilters(draft);
          }}
        >
          {(Object.keys(EMPTY) as (keyof typeof EMPTY)[]).map((key) => (
            <label key={key} className="text-xs text-muted-foreground">
              {t(`admin.audit.filters.${key === "actorEmail" ? "actor" : key}`)}
              <Input value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} data-testid={`admin-audit-filter-${key}`} className="w-full sm:w-44" />
            </label>
          ))}
          <Button type="submit" variant="secondary" data-testid="admin-audit-apply">
            {t("admin.audit.filters.apply")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDraft(EMPTY);
              setFilters(EMPTY);
              setPage(1);
            }}
          >
            {t("admin.audit.filters.clear")}
          </Button>
        </form>
      </Card>
      <Card>
        {query.isLoading ? <p className="text-sm text-muted-foreground">{t("admin.common.loading")}</p> : null}
        {query.isError ? <p className="text-sm text-destructive">{t("admin.common.error")}</p> : null}
        {query.data && query.data.items.length === 0 ? <p className="text-sm text-muted-foreground">{t("admin.audit.empty")}</p> : null}
        {query.data && query.data.items.length > 0 ? (
          <ScrollTable testId="admin-audit-table">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-4">{t("admin.audit.columns.when")}</th>
                <th className="py-2 pr-4">{t("admin.audit.columns.who")}</th>
                <th className="py-2 pr-4">{t("admin.audit.columns.action")}</th>
                <th className="py-2 pr-4">{t("admin.audit.columns.target")}</th>
                <th className="py-2 pr-4">{t("admin.audit.columns.outcome")}</th>
                <th className="py-2">{t("admin.audit.columns.change")}</th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((row) => (
                <tr key={row.id} className="border-t align-top" data-testid={`admin-audit-row-${row.id}`}>
                  <td className="py-2 pr-4 whitespace-nowrap text-xs">{new Date(row.createdAt).toLocaleString(i18n.language)}</td>
                  <td className="py-2 pr-4">
                    {row.actorEmail}
                    {row.actorRole ? <span className="ml-1 text-xs text-muted-foreground">({row.actorRole})</span> : null}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">{row.action}</td>
                  <td className="py-2 pr-4 text-xs">{row.targetType ? `${row.targetType} ${row.targetId ?? ""}` : "—"}</td>
                  <td className="py-2 pr-4">
                    <Badge tone={tone(row.outcome)}>{t(`admin.audit.outcome.${row.outcome}`)}</Badge>
                  </td>
                  <td className="py-2">
                    <Change row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        ) : null}
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} data-testid="admin-audit-prev">
            {t("admin.audit.prev")}
          </Button>
          <span>{t("admin.audit.page", { page })}</span>
          <Button variant="ghost" disabled={!query.data?.hasMore} onClick={() => setPage((p) => p + 1)} data-testid="admin-audit-next">
            {t("admin.audit.next")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
