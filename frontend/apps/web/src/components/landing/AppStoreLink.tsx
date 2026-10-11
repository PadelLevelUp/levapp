import { useTranslation } from "react-i18next";
import { Smartphone } from "lucide-react";
import { APP_STORE_URL } from "@levelup/config";
import { cn } from "@/lib/utils";

/**
 * PAD-619 (auth.landing-page rule 15): "Descarrega na App Store", opening LevApp's App Store page
 * (the same link as the install suggestion, PAD-573) in a new tab. A drawn button, not Apple's
 * badge artwork. `placement` tells the call sites apart in tests.
 */
export function AppStoreLink({ placement, className }: { placement: "hero" | "cta"; className?: string }) {
  const { t } = useTranslation();
  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("landing.appStore.aria")}
      data-testid="landing-app-store"
      data-placement={placement}
      className={cn(
        "inline-flex h-[52px] items-center gap-3 rounded-xl bg-foreground px-5 text-background transition-opacity hover:opacity-90",
        className,
      )}
    >
      <Smartphone className="size-5 shrink-0" aria-hidden />
      <span className="flex flex-col items-start leading-tight" aria-hidden>
        <span className="text-[11px] font-medium opacity-80">{t("landing.appStore.eyebrow")}</span>
        <span className="text-[17px] font-semibold">{t("landing.appStore.name")}</span>
      </span>
    </a>
  );
}
