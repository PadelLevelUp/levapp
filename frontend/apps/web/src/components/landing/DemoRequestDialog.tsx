import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DemoPedido } from "@/lib/demoRequest";
import { DemoRequestForm } from "./DemoRequestForm";

/**
 * The site's contact dialog, "Vamos falar!" (PAD-469, PAD-617, PAD-650; auth.landing-page
 * rule 10): the shell around the one contact form (DemoRequestForm), which the /contacto page
 * also hosts (PAD-656). The content unmounts on close, so every open starts clean.
 */
export function DemoRequestDialog({
  open,
  onOpenChange,
  fallbackHref,
  pedido,
  showMarketing = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fallbackHref: string;
  /** Set by the demo buttons; "Falar connosco" leaves it out. */
  pedido?: DemoPedido;
  /** The build carries a marketing subscription id (`hasMarketingSubscription`). */
  showMarketing?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="demo-dialog"
        // The ticket's form rule: a 1px border and no shadow.
        className="max-h-[90vh] overflow-y-auto shadow-none sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>{t("landing.demo.title")}</DialogTitle>
          <DialogDescription>{t("landing.demo.subtitle")}</DialogDescription>
          <p data-testid="demo-hubspot-notice" className="text-sm text-muted-foreground">
            {t("landing.demo.providedBy")}
          </p>
        </DialogHeader>
        <DemoRequestForm
          fallbackHref={fallbackHref}
          pedido={pedido}
          showMarketing={showMarketing}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
