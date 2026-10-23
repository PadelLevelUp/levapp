import { useTranslation } from "react-i18next";

import type { FinanceImportStatus } from "@/lib/api";

// admin.finance rule 9: a failed or stalled Google Cloud import is never silent.
export function ImportBanner({ status }: { status: FinanceImportStatus }) {
  const { t, i18n } = useTranslation();
  const date = status.lastOkAt ? new Date(status.lastOkAt).toLocaleString(i18n.language) : t("admin.finance.banner.never");
  if (!status.configured) {
    return (
      <p className="mb-4 rounded-md bg-muted p-3 text-sm text-muted-foreground" data-testid="finance-import-not-configured">
        {t("admin.finance.banner.notConfigured")}
      </p>
    );
  }
  const failed = status.lastRun?.outcome === "error";
  if (!failed && !status.stale) return null;
  return (
    <p role="alert" className="mb-4 rounded-md bg-destructive p-3 text-sm text-destructive-foreground" data-testid="finance-import-banner">
      {failed
        ? t("admin.finance.banner.error", { code: status.lastRun?.errorCode ?? "", date })
        : t("admin.finance.banner.stale", { date })}
    </p>
  );
}
