import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ScrollTable } from "@/components/ScrollTable";
import { Badge, Button, Card, Select } from "@/components/ui";
import { FINANCE_CATEGORIES, adminApi, type FinanceCost } from "@/lib/api";
import { CostForm } from "./CostForm";

function Revisions({ costId }: { costId: number }) {
  const { t, i18n } = useTranslation();
  const query = useQuery({ queryKey: ["admin", "finance", "revisions", costId], queryFn: () => adminApi.financeCostRevisions(costId) });
  return (
    <ul className="space-y-1 text-xs text-muted-foreground" data-testid={`finance-cost-${costId}-revisions`}>
      {(query.data?.items ?? []).map((r) => (
        <li key={r.id}>
          {t("admin.finance.costs.revision", { n: r.revision })} · {r.action} · {new Date(r.createdAt).toLocaleString(i18n.language)} ·{" "}
          {r.actorEmail} · {r.snapshot.amount} {r.snapshot.currency} ({r.snapshot.amountEur} €)
        </li>
      ))}
    </ul>
  );
}

// admin.finance rules 3, 5, 5b: the manual costs, their form, soft delete and history.
export function CostsTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [editing, setEditing] = useState<FinanceCost | "new" | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [history, setHistory] = useState<number | null>(null);
  const query = useQuery({
    queryKey: ["admin", "finance", "costs", category, showDeleted],
    queryFn: () => adminApi.financeCosts({ category, includeDeleted: showDeleted }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => adminApi.deleteFinanceCost(id),
    onSuccess: async () => {
      setConfirming(null);
      await queryClient.invalidateQueries({ queryKey: ["admin", "finance"] });
    },
  });
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted-foreground">
          {t("admin.finance.columns.category")}
          <Select className="block w-full sm:w-48" value={category} onChange={(e) => setCategory(e.target.value)} data-testid="finance-costs-filter-category">
            <option value="">{t("admin.finance.costs.all")}</option>
            {FINANCE_CATEGORIES.map((c) => <option key={c} value={c}>{t(`admin.finance.categories.${c}`)}</option>)}
          </Select>
        </label>
        <label className="flex h-11 items-center gap-2 text-sm md:h-9">
          <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} data-testid="finance-costs-show-deleted" />
          {t("admin.finance.costs.showDeleted")}
        </label>
        <Button className="ml-auto" onClick={() => setEditing("new")} data-testid="finance-cost-add">
          {t("admin.finance.costs.add")}
        </Button>
      </div>
      {editing ? <CostForm key={editing === "new" ? "new" : editing.id} cost={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} /> : null}
      {query.isError ? <p className="text-sm text-destructive">{t("admin.common.error")}</p> : null}
      {query.data && query.data.items.length === 0 ? <p className="text-sm text-muted-foreground">{t("admin.finance.costs.empty")}</p> : null}
      {query.data && query.data.items.length > 0 ? (
        <ScrollTable testId="finance-costs-table">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-2 pr-4">{t("admin.finance.columns.startsOn")}</th>
              <th className="py-2 pr-4">{t("admin.finance.columns.category")}</th>
              <th className="py-2 pr-4">{t("admin.finance.columns.vendor")}</th>
              <th className="py-2 pr-4">{t("admin.finance.columns.recurrence")}</th>
              <th className="py-2 pr-4 text-right">{t("admin.finance.columns.amount")}</th>
              <th className="py-2 pr-4 text-right">{t("admin.finance.columns.amountEur")}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {query.data.items.map((cost) => (
              <tr key={cost.id} className="border-t align-top" data-testid={`finance-cost-${cost.id}`}>
                <td className="py-2 pr-4 whitespace-nowrap">
                  {cost.startsOn}
                  {cost.endsOn ? ` → ${cost.endsOn}` : ""}
                </td>
                <td className="py-2 pr-4">{t(`admin.finance.categories.${cost.category}`)}</td>
                <td className="py-2 pr-4">
                  <div className="font-medium">{cost.vendor}</div>
                  <div className="text-xs text-muted-foreground">{cost.description}</div>
                  {history === cost.id ? <Revisions costId={cost.id} /> : null}
                </td>
                <td className="py-2 pr-4">{t(`admin.finance.recurrences.${cost.recurrence}`)}</td>
                <td className="py-2 pr-4 text-right tabular-nums">
                  {cost.amount} {cost.currency}
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">{cost.amountEur}</td>
                <td className="py-2">
                  {cost.deletedAt ? (
                    <Badge tone="muted">{t("admin.finance.costs.deleted")}</Badge>
                  ) : confirming === cost.id ? (
                    <div role="alertdialog" className="flex flex-col gap-2" data-testid={`finance-cost-${cost.id}-confirm`}>
                      <span className="text-xs">{t("admin.finance.costs.confirmDelete")}</span>
                      <div className="flex gap-2">
                        <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate(cost.id)} data-testid={`finance-cost-${cost.id}-confirm-delete`}>
                          {t("admin.common.confirm")}
                        </Button>
                        <Button variant="ghost" onClick={() => setConfirming(null)}>
                          {t("admin.common.cancel")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      <Button variant="ghost" onClick={() => setEditing(cost)} data-testid={`finance-cost-${cost.id}-edit`}>
                        {t("admin.finance.costs.edit")}
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirming(cost.id)} data-testid={`finance-cost-${cost.id}-delete`}>
                        {t("admin.finance.costs.delete")}
                      </Button>
                      <Button variant="ghost" onClick={() => setHistory(history === cost.id ? null : cost.id)} data-testid={`finance-cost-${cost.id}-history`}>
                        {t("admin.finance.costs.history")}
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </ScrollTable>
      ) : null}
    </Card>
  );
}
