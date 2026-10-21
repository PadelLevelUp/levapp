import { createContext, useContext, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { DemoRequestDialog } from "@/components/landing/DemoRequestDialog";
import { demoFormId, hasMarketingSubscription } from "@/lib/hubspot";
import { CONTACT_EMAIL } from "@levelup/config";
import type { DemoPedido } from "@/lib/demoRequest";

/**
 * The new site's contact dialog (PAD-656): mounted once by the layout, opened from any header
 * button or section through `useSiteDemo()`. The demo buttons pass `"demonstracao"` (HubSpot's
 * `levapp_pedido_site`); "Falar connosco" passes nothing. Without a form id in the build
 * (`VITE_HUBSPOT_DEMO_FORM_ID`), `open` is null and callers fall back to `mailtoHref`.
 */
interface SiteDemo {
  open: ((pedido?: DemoPedido) => void) | null;
  mailtoHref: string;
}

const SiteDemoContext = createContext<SiteDemo | null>(null);

export function useSiteDemo(): SiteDemo {
  const ctx = useContext(SiteDemoContext);
  if (!ctx) throw new Error("useSiteDemo() outside <SiteDemoProvider>");
  return ctx;
}

export function SiteDemoProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [isOpen, setOpen] = useState(false);
  const [pedido, setPedido] = useState<DemoPedido | undefined>(undefined);
  const mailtoHref = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t("landing.mail.demoSubject"))}`;
  const formId = demoFormId();
  const value: SiteDemo = {
    mailtoHref,
    open: formId
      ? (p) => {
          setPedido(p);
          setOpen(true);
        }
      : null,
  };
  return (
    <SiteDemoContext.Provider value={value}>
      {children}
      {formId && (
        <DemoRequestDialog
          open={isOpen}
          onOpenChange={setOpen}
          fallbackHref={mailtoHref}
          pedido={pedido}
          showMarketing={hasMarketingSubscription()}
        />
      )}
    </SiteDemoContext.Provider>
  );
}
