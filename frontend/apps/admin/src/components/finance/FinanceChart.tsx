import { useTranslation } from "react-i18next";

import { FINANCE_CATEGORIES, type FinanceSummaryMonth } from "@/lib/api";

// admin.finance rule 12: one stacked bar per month, drawn as inline SVG (no chart dependency).
export const CATEGORY_COLORS: Record<string, string> = {
  infrastructure: "#2563eb",
  ai_tools: "#9333ea",
  stores: "#059669",
  domains_dns: "#d97706",
  email_crm: "#db2777",
  other: "#64748b",
};

const HEIGHT = 160;
const BAR = 18;
const GAP = 8;

export function FinanceChart({ months }: { months: FinanceSummaryMonth[] }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...months.map((m) => Number(m.total)));
  const width = Math.max(1, months.length * (BAR + GAP));
  return (
    <figure className="mb-4" data-testid="finance-chart">
      <div className="overflow-x-auto">
        <svg role="img" aria-label={t("admin.finance.summary.chart")} width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`}>
          {months.map((month, i) => {
            let y = HEIGHT;
            return (
              <g key={month.month}>
                <title>{`${month.month}: ${month.total} €`}</title>
                {FINANCE_CATEGORIES.filter((c) => month.byCategory[c]).map((c) => {
                  const h = (Number(month.byCategory[c]) / max) * HEIGHT;
                  y -= h;
                  return <rect key={c} x={i * (BAR + GAP)} y={y} width={BAR} height={h} fill={CATEGORY_COLORS[c]} />;
                })}
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {FINANCE_CATEGORIES.map((c) => (
          <span key={c} className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: CATEGORY_COLORS[c] }} />
            {t(`admin.finance.categories.${c}`)}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
