import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

/**
 * The landing page's cookie banner (PAD-469, auth.landing-page rule 11).
 *
 * Sticky to the bottom of the viewport but placed in the page flow after the
 * footer, so it never covers the footer once the visitor scrolls to the end.
 * Recusar and Aceitar (in that order) are the same button — same variant,
 * size and weight — so declining is exactly as easy as accepting.
 */
export function CookieBanner({
  onAccept,
  onDecline,
}: {
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section
      data-testid="cookie-banner"
      aria-label={t("landing.cookies.title")}
      className="sticky bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90"
    >
      <div className="mx-auto flex max-w-[1170px] flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center lg:px-6">
        <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">
            {t("landing.cookies.title")}.{" "}
          </span>
          {t("landing.cookies.body")}{" "}
          <Link
            reloadDocument
            to="/privacy"
            className="underline hover:text-foreground"
          >
            {t("landing.cookies.privacyLink")}
          </Link>
        </p>
        <div className="grid grid-cols-2 gap-3 sm:flex">
          <Button
            type="button"
            variant="outline"
            className="bg-card sm:min-w-[120px]"
            data-testid="cookie-decline"
            onClick={onDecline}
          >
            {t("landing.cookies.decline")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="bg-card sm:min-w-[120px]"
            data-testid="cookie-accept"
            onClick={onAccept}
          >
            {t("landing.cookies.accept")}
          </Button>
        </div>
      </div>
    </section>
  );
}
