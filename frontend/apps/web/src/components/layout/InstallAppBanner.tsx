import { useState } from "react";
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
  // One dismissal object per mount, over the device's localStorage (rule 3); a missing or
  // throwing storage reads as "not dismissed" and remembers a dismissal for the page only.
  const [dismissal] = useState(() =>
    installSuggestionDismissal(typeof window === "undefined" ? null : window.localStorage)
  );
  const [dismissed, setDismissed] = useState(() => dismissal.isDismissed());

  const userAgent = typeof navigator === "undefined" ? null : navigator.userAgent;
  if (dismissed || !suggestsIosApp(user, userAgent)) return null;

  // PAD-628 (rule 4a): a slim strip on the narrowest phones. The row used to hold the full
  // "Ir para a App Store" button and the close button at full width, so at 320 px the text got
  // ~50 px and wrapped one word per line (a 310 px card). Below `sm` the button says "Abrir",
  // the title is clamped to two lines and the body line is left out.
  return (
    <div
      data-testid="install-app-banner"
      role="status"
      className="mx-3 mt-2 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 sm:mx-4 sm:mt-4 sm:gap-3 sm:p-3 md:mx-6"
    >
      <Smartphone className="h-4 w-4 shrink-0 text-primary sm:h-5 sm:w-5" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium leading-5">{t("installApp.title")}</p>
        <p className="hidden text-xs text-muted-foreground sm:block">{t("installApp.body")}</p>
      </div>
      <Button size="sm" className="h-8 shrink-0 px-3" asChild>
        <a
          data-testid="install-app-open"
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("installApp.open")}
        >
          <span className="sm:hidden">{t("installApp.openShort")}</span>
          <span className="hidden sm:inline">{t("installApp.open")}</span>
        </a>
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 shrink-0"
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
