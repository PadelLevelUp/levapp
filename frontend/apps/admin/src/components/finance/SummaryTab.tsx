import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ScrollTable } from "@/components/ScrollTable";
import { Button, Card } from "@/components/ui";
import { downloadFinanceCsv, type FinanceSummary } from "@/lib/api";
import { FinanceChart } from "./FinanceChart";

export function SummaryTab({ summary }: { summary: FinanceSummary }) {
  const { t } = useTranslation();
  const [downloading, setDownloading] = useState(false);
  const newestFirst = [...summary.months].reverse();
  return (
    <Card>
      {summary.months.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="finance-summary-empty">
          {t("admin.finance.summary.empty")}
        </p>
      ) : (
        <>
          <FinanceChart months={summary.months} />
          {summary.superseded.length > 0 ? (
            <p className="mb-3 text-xs text-muted-foreground" data-testid="finance-superseded">
              {t("admin.finance.summary.superseded", { count: summary.superseded.length })}
            </p>
          ) : null}
          <ScrollTable testId="finance-summary-table">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-4">{t("admin.finance.columns.month")}</th>
                {summary.categories.map((c) => (
                  <th key={c} className="py-2 pr-4 text-right">
                    {t(`admin.finance.categories.${c}`)}
                  </th>
                ))}
                <th className="py-2 pr-4 text-right">{t("admin.finance.columns.total")}</th>
                <th className="py-2 text-right">{t("admin.finance.columns.cumulative")}</th>
              </tr>
            </thead>
            <tbody>
              {newestFirst.map((m) => (
                <tr key={m.month} className="border-t" data-testid={`finance-month-${m.month}`}>
                  <td className="py-2 pr-4 whitespace-nowrap font-medium">{m.month}</td>
                  {summary.categories.map((c) => (
                    <td key={c} className="py-2 pr-4 text-right tabular-nums">
                      {m.byCategory[c] ?? "—"}
                    </td>
                  ))}
                  <td className="py-2 pr-4 text-right font-medium tabular-nums" data-testid={`finance-month-${m.month}-total`}>
                    {m.total}
                  </td>
                  <td className="py-2 text-right tabular-nums" data-testid={`finance-month-${m.month}-cumulative`}>
                    {m.cumulative}
                  </td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        </>
      )}
      <div className="mt-4">
        <Button
          variant="secondary"
          disabled={downloading || summary.months.length === 0}
          data-testid="finance-download-csv"
          onClick={async () => {
            setDownloading(true);
            try {
              await downloadFinanceCsv();
            } finally {
              setDownloading(false);
            }
          }}
        >
          {t("admin.finance.summary.download")}
        </Button>
      </div>
    </Card>
  );
}
