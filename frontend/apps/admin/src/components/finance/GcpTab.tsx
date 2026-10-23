import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ScrollTable } from "@/components/ScrollTable";
import { Badge, Button, Card, Select } from "@/components/ui";
import { ApiError, adminApi, type FinanceImportRun } from "@/lib/api";

function monthsBetween(start: string | null, end: string): string[] {
  if (!start) return [end];
  const out: string[] = [];
  let [y, m] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out.reverse();
}

function thisMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

const TONE: Record<FinanceImportRun["outcome"], "success" | "warning" | "destructive" | "muted"> = {
  ok: "success", running: "warning", error: "destructive", not_configured: "muted",
};

// admin.finance rules 7–9: one month's imported lines, the latest runs and "Import now".
export function GcpTab({ start }: { start: string | null }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const months = monthsBetween(start && start < thisMonth() ? start : null, thisMonth());
  const [month, setMonth] = useState(months[0]);
  const lines = useQuery({ queryKey: ["admin", "finance", "gcp", month], queryFn: () => adminApi.financeGcpMonth(month) });
  const runs = useQuery({ queryKey: ["admin", "finance", "runs"], queryFn: adminApi.financeImportRuns });
  const running = (runs.data?.items ?? []).some((r) => r.outcome === "running");
  const importNow = useMutation({
    mutationFn: adminApi.financeImportNow,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin", "finance"] }),
  });
  const importError = importNow.error instanceof ApiError && importNow.error.code === "IMPORT_RUNNING";
  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted-foreground">
            {t("admin.finance.gcp.month")}
            <Select className="block w-full sm:w-40" value={month} onChange={(e) => setMonth(e.target.value)} data-testid="finance-gcp-month">
              {months.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
          </label>
          <Button className="ml-auto" disabled={running || importNow.isPending} onClick={() => importNow.mutate()} data-testid="finance-gcp-import-now">
            {t("admin.finance.gcp.importNow")}
          </Button>
        </div>
        {importError ? (
          <p role="alert" className="mb-3 text-sm text-destructive" data-testid="finance-gcp-import-running">
            {t("admin.finance.errors.IMPORT_RUNNING")}
          </p>
        ) : null}
        {lines.data && lines.data.items.length === 0 ? <p className="text-sm text-muted-foreground">{t("admin.finance.gcp.empty")}</p> : null}
        {lines.data && lines.data.items.length > 0 ? (
          <ScrollTable testId="finance-gcp-table">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-4">{t("admin.finance.columns.project")}</th>
                <th className="py-2 pr-4">{t("admin.finance.columns.service")}</th>
                <th className="py-2 pr-4 text-right">{t("admin.finance.columns.cost")}</th>
                <th className="py-2 pr-4 text-right">{t("admin.finance.columns.credits")}</th>
                <th className="py-2 text-right">{t("admin.finance.columns.net")}</th>
              </tr>
            </thead>
            <tbody>
              {lines.data.items.map((line) => (
                <tr key={`${line.projectId}-${line.service}`} className="border-t">
                  <td className="py-2 pr-4 font-mono text-xs">{line.projectId}</td>
                  <td className="py-2 pr-4">{line.service}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{line.cost}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{line.credits}</td>
                  <td className="py-2 text-right font-medium tabular-nums">{line.net}</td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        ) : null}
      </Card>
      <Card>
        <h2 className="mb-3 text-sm font-semibold">{t("admin.finance.gcp.runs")}</h2>
        <ScrollTable testId="finance-gcp-runs">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-2 pr-4">{t("admin.finance.columns.started")}</th>
              <th className="py-2 pr-4">{t("admin.finance.columns.trigger")}</th>
              <th className="py-2 pr-4">{t("admin.finance.columns.actor")}</th>
              <th className="py-2 pr-4">{t("admin.finance.columns.outcome")}</th>
              <th className="py-2 pr-4 text-right">{t("admin.finance.columns.rows")}</th>
              <th className="py-2">{t("admin.finance.columns.error")}</th>
            </tr>
          </thead>
          <tbody>
            {(runs.data?.items ?? []).map((run) => (
              <tr key={run.id} className="border-t" data-testid={`finance-run-${run.id}`}>
                <td className="py-2 pr-4 whitespace-nowrap text-xs">{new Date(run.startedAt).toLocaleString(i18n.language)}</td>
                <td className="py-2 pr-4">{t(`admin.finance.gcp.trigger.${run.trigger}`)}</td>
                <td className="py-2 pr-4 text-xs">{run.actorEmail ?? "—"}</td>
                <td className="py-2 pr-4">
                  <Badge tone={TONE[run.outcome]}>{t(`admin.finance.gcp.outcome.${run.outcome}`)}</Badge>
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">{run.rows}</td>
                <td className="py-2 text-xs" title={run.errorMessage ?? undefined}>
                  {run.errorCode ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </ScrollTable>
      </Card>
    </div>
  );
}
