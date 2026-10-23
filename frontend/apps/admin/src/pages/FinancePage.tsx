import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { CostsTab } from "@/components/finance/CostsTab";
import { GcpTab } from "@/components/finance/GcpTab";
import { ImportBanner } from "@/components/finance/ImportBanner";
import { SummaryTab } from "@/components/finance/SummaryTab";
import { Card, PageHeader } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { FINANCE_ROLE } from "@/lib/finance";

const TABS = ["summary", "costs", "gcp"] as const;
type Tab = (typeof TABS)[number];

// admin.finance (PAD-742) rule 12: every LevApp cost, by month and category. Owner only (rule 1).
export function FinancePage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const allowed = can(FINANCE_ROLE);
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as Tab) : "summary";
  const summary = useQuery({ queryKey: ["admin", "finance", "summary"], queryFn: () => adminApi.financeSummary(), enabled: allowed });

  if (!allowed) {
    return (
      <div>
        <PageHeader title={t("admin.finance.title")} />
        <Card>
          <p className="text-sm text-muted-foreground" data-testid="finance-not-allowed">
            {t("admin.finance.notAllowed")}
          </p>
        </Card>
      </div>
    );
  }
  return (
    <div>
      <PageHeader title={t("admin.finance.title")} lead={t("admin.finance.lead")} />
      {summary.data ? <ImportBanner status={summary.data.importStatus} /> : null}
      <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b">
        {TABS.map((key) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={tab === key}
            data-testid={`finance-tab-${key}`}
            onClick={() => setParams(key === "summary" ? {} : { tab: key })}
            className={clsx(
              "h-11 whitespace-nowrap border-b-2 px-3 text-sm md:h-9",
              tab === key ? "border-primary font-medium" : "border-transparent text-muted-foreground",
            )}
          >
            {t(`admin.finance.tabs.${key}`)}
          </button>
        ))}
      </div>
      {summary.isLoading ? <p className="text-sm text-muted-foreground">{t("admin.common.loading")}</p> : null}
      {summary.isError ? <p className="text-sm text-destructive">{t("admin.common.error")}</p> : null}
      {tab === "summary" && summary.data ? <SummaryTab summary={summary.data} /> : null}
      {tab === "costs" ? <CostsTab /> : null}
      {tab === "gcp" && summary.data ? <GcpTab start={summary.data.start} /> : null}
    </div>
  );
}
