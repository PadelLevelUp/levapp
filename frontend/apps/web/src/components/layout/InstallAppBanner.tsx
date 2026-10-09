import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Smartphone, X } from "lucide-react";
import { APP_STORE_URL, installSuggestionDismissal, suggestsIosApp } from "@levelup/config";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";

/**
 * PAD-573 (mobile.install-suggestion): on an iPhone, a signed-in student is offered the iOS app
 * once, above the page, dismissible for 30 days on the device (rule 3). Coaches, desktop and
 * Android see nothing (rule 1). Never a hold (rule 4): it pushes the page down and is gone on
 * "Agora não". Web-only by nature — it is a prompt to leave the web app. Safari also shows
 * Apple's Smart App Banner from the meta tag in index.html (rule 5).
 */
export function InstallAppBanner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const dismissal = useMemo(
    () => installSuggestionDismissal(typeof window === "undefined" ? null : window.localStorage),
    []
  );
  const [dismissed, setDismissed] = useState(() => dismissal.isDismissed());

  const userAgent = typeof navigator === "undefined" ? null : navigator.userAgent;
  if (dismissed || !suggestsIosApp(user, userAgent)) return null;

  return (
    <div
      data-testid="install-app-banner"
      role="status"
      className="mx-4 mt-4 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3 md:mx-6"
    >
      <Smartphone className="h-5 w-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t("installApp.title")}</p>
        <p className="text-xs text-muted-foreground">{t("installApp.body")}</p>
      </div>
      <Button size="sm" asChild>
        <a data-testid="install-app-open" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
          {t("installApp.open")}
        </a>
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="shrink-0"
        data-testid="install-app-dismiss"
        aria-label={t("installApp.dismiss")}
        onClick={() => {
          dismissal.dismiss();
          setDismissed(true);
        }}
      >
        <X className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
}
