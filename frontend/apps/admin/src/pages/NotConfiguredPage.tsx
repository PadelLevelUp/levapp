import { useTranslation } from "react-i18next";

import { Button, Card } from "@/components/ui";

// admin.foundation rule 13: an empty ADMIN_GOOGLE_CLIENT_ID is a state, not a crash.
export function NotConfiguredPage({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="max-w-md" data-testid="admin-not-configured">
        <h1 className="font-display text-xl font-semibold">{t("admin.notConfigured.title")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("admin.notConfigured.body")}</p>
        <Button className="mt-5" variant="secondary" onClick={onRetry}>
          {t("admin.notConfigured.retry")}
        </Button>
      </Card>
    </div>
  );
}
