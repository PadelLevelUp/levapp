import { useTranslation } from "react-i18next";
import { Smartphone } from "lucide-react";
import { APP_STORE_URL } from "@levelup/config";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * PAD-619 (auth.landing-page rule 15): "Descarrega na App Store", opening LevApp's App Store page
 * (the same link as the install suggestion, PAD-573) in a new tab. A drawn button, not Apple's
 * badge artwork; the shared Button gives it the page's radius and focus ring. Its accessible name is
 * the visible text plus "(abre num separador novo)" (WCAG 2.5.3, label in name). `placement` tells
 * the call sites apart in tests.
 */
export function AppStoreLink({ placement, className }: { placement: "hero" | "cta"; className?: string }) {
  const { t } = useTranslation();
  return (
    <Button
      asChild
      size="lg"
      className={cn("h-[52px] gap-3 bg-foreground px-5 text-background hover:bg-foreground/90", className)}
    >
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="landing-app-store"
        data-placement={placement}
      >
        <Smartphone className="size-5 shrink-0" aria-hidden />
        <span className="flex flex-col items-start leading-tight">
          <span className="text-[11px] font-medium opacity-80">{t("landing.appStore.eyebrow")}</span>
          <span className="text-[17px] font-semibold">{t("landing.appStore.name")}</span>
        </span>
        <span className="sr-only">{t("landing.appStore.newTab")}</span>
      </a>
    </Button>
  );
}
