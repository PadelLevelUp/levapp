import { useTranslation } from "react-i18next";

import { Card, PageHeader } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export function HomePage() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  if (!session) return null;
  const ends = new Date(session.expiresAt).toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit" });
  return (
    <div>
      <PageHeader title={t("admin.home.welcome", { email: session.email })} lead={t("admin.home.yourRole", { role: session.role })} />
      <Card>
        <p className="text-sm text-muted-foreground">{t("admin.home.empty")}</p>
        <p className="mt-2 text-xs text-muted-foreground" data-testid="admin-session-ends">
          {t("admin.home.sessionEnds", { time: ends })}
        </p>
      </Card>
    </div>
  );
}
