import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  HUBSPOT_PORTAL_ID,
  HUBSPOT_REGION,
  loadFormsEmbed,
} from "@/lib/hubspot";

const FORM_TARGET_ID = "hubspot-demo-form";

/**
 * The "Pedir demonstração" dialog (PAD-469, auth.landing-page rule 10). It
 * embeds the HubSpot form whose ID the build carries. The embed loads the
 * first time the dialog opens and never waits for the cookie choice; it is a
 * service the visitor asked for. The tracking script is never loaded here.
 */
export function DemoRequestDialog({
  open,
  onOpenChange,
  formId,
  fallbackHref,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formId: string;
  fallbackHref: string;
}) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setFailed(false);
    loadFormsEmbed()
      .then((forms) => {
        if (cancelled) return;
        forms.create({
          region: HUBSPOT_REGION,
          portalId: HUBSPOT_PORTAL_ID,
          formId,
          target: `#${FORM_TARGET_ID}`,
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, formId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="demo-dialog"
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>{t("landing.demo.title")}</DialogTitle>
          <DialogDescription data-testid="demo-hubspot-notice">
            {t("landing.demo.providedBy")}{" "}
            <Link reloadDocument to="/privacy" className="underline">
              {t("landing.demo.privacyLink")}
            </Link>
          </DialogDescription>
        </DialogHeader>
        {failed ? (
          <p className="text-sm text-muted-foreground">
            {t("landing.demo.failed")}{" "}
            <a
              href={fallbackHref}
              className="font-semibold text-primary underline"
            >
              {t("landing.demo.failedLink")}
            </a>
          </p>
        ) : (
          <div id={FORM_TARGET_ID} className="min-h-[200px]" />
        )}
      </DialogContent>
    </Dialog>
  );
}
