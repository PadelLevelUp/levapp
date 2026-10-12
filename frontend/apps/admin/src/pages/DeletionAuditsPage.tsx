import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button, Card, Input, PageHeader } from "@/components/ui";
import { ScrollTable } from "@/components/ScrollTable";
import { adminApi, type DeletionAuditRow } from "@/lib/api";

function Counts({ details }: { details: DeletionAuditRow["details"] }) {
  const pairs = Object.entries(details ?? {});
  if (pairs.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="text-xs">
      {pairs.map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(", ")}
    </span>
  );
}

/** admin.moderation rules 6 and 7 (PAD-631): the record of destructive deletes, read only. */
export function DeletionAuditsPage() {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState("");
  const [entity, setEntity] = useState("");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["admin", "deletion-audits", entity, page],
    queryFn: () => adminApi.deletionAudits(entity, page),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <PageHeader title={t("admin.deletionAudits.title")} lead={t("admin.deletionAudits.lead")} />
      <Card className="mb-6">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setEntity(draft.trim());
          }}
        >
          <label className="text-xs text-muted-foreground">
            {t("admin.deletionAudits.filters.entity")}
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("admin.deletionAudits.filters.placeholder")}
              data-testid="deletion-audits-filter-entity"
              className="w-full sm:w-44"
            />
          </label>
          <Button type="submit" variant="secondary" data-testid="deletion-audits-apply">
            {t("admin.deletionAudits.filters.apply")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setDraft("");
              setEntity("");
              setPage(1);
            }}
          >
            {t("admin.deletionAudits.filters.clear")}
          </Button>
        </form>
      </Card>
      <Card>
        {query.isLoading ? <p className="text-sm text-muted-foreground">{t("admin.common.loading")}</p> : null}
        {query.isError ? <p className="text-sm text-destructive">{t("admin.common.error")}</p> : null}
        {query.data && query.data.items.length === 0 ? <p className="text-sm text-muted-foreground">{t("admin.deletionAudits.empty")}</p> : null}
        {query.data && query.data.items.length > 0 ? (
          // Read only, many columns: the own-scroll container (admin.phone-console rule 3).
          <ScrollTable testId="deletion-audits-table">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                {["when", "who", "entity", "action", "label", "counts"].map((c) => (
                  <th key={c} className="py-2 pr-4">{t(`admin.deletionAudits.columns.${c}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((row) => (
                <tr key={row.id} className="border-t align-top" data-testid={`deletion-audit-row-${row.id}`}>
                  <td className="py-2 pr-4 whitespace-nowrap text-xs">{new Date(row.createdAt).toLocaleString(i18n.language)}</td>
                  <td className="py-2 pr-4">{row.actor?.name ?? t("admin.deletionAudits.system")}</td>
                  <td className="py-2 pr-4 text-xs">{row.entity} {row.entityId ?? ""}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{row.action}</td>
                  <td className="py-2 pr-4">{row.label ?? "—"}</td>
                  <td className="py-2"><Counts details={row.details} /></td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        ) : null}
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <Button variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} data-testid="deletion-audits-prev">
            {t("admin.deletionAudits.prev")}
          </Button>
          <span>{t("admin.deletionAudits.page", { page })}</span>
          <Button variant="ghost" disabled={!query.data?.hasMore} onClick={() => setPage((p) => p + 1)} data-testid="deletion-audits-next">
            {t("admin.deletionAudits.next")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
