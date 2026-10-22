/**
 * /contacto (PAD-656): the site's one contact form (DemoRequestForm, the dialog's form) on a page
 * of its own, inside the site's frame. It sends no `pedido` — HubSpot tells it from a demo request
 * by the missing `levapp_pedido_site` and the page URL (`pageUri`) — and keeps the audience
 * switcher working through `?para=`.
 */
import { useTranslation } from "react-i18next";
import { CONTACT_EMAIL } from "@levelup/config";

import { DemoRequestForm } from "@/components/landing/DemoRequestForm";
import { ExitLink } from "@/components/landing/ExitLink";
import { hasMarketingSubscription } from "@/lib/hubspot";

import { useAudience } from "../audience";
import { SiteFrame } from "../SiteFrame";
import { siteButton } from "../SiteLayout";

export default function ContactPage() {
  const { t } = useTranslation();
  const [audience, setAudience] = useAudience();
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t("site.contact.mailSubject"))}`;
  return (
    <SiteFrame audience={audience} onAudienceChange={setAudience}>
      {() => (
        <section data-testid="contact-page" className="bg-site-wash px-4 py-12 sm:px-6 sm:py-16">
          <div className="mx-auto w-full min-w-0 max-w-xl">
            <h1 className="font-display text-3xl font-semibold text-site-ink sm:text-4xl">
              {t("site.contact.title")}
            </h1>
            <p className="mt-3 text-base text-site-muted">{t("site.contact.intro")}</p>
            <div className="mt-8 rounded-xl border border-site-border bg-white p-5 sm:p-8">
              <DemoRequestForm
                fallbackHref={mailto}
                showMarketing={hasMarketingSubscription()}
                afterSent={
                  <ExitLink to="/" className={siteButton.outline} data-testid="contact-home">
                    {t("site.contact.backHome")}
                  </ExitLink>
                }
              />
            </div>
          </div>
        </section>
      )}
    </SiteFrame>
  );
}
