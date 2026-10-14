import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { ExitLink } from "./ExitLink";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Button } from "@/components/ui/button";
import { readConsent } from "@/lib/cookieConsent";
import {
  GESTAO_VALUES,
  LEMBRETES_VALUES,
  TEMPO_VALUES,
  normalisePhone,
  sendDemoRequest,
  type DemoPedido,
} from "@/lib/demoRequest";

/**
 * The site's contact dialog, "Vamos falar!" (PAD-469, PAD-617, PAD-650; auth.landing-page
 * rule 10). LevApp's own form: it posts to `/api/public/demo-request` and never reaches a
 * HubSpot host, so it neither waits for the cookie choice nor loads the tracking script. The
 * visitor's `hubspotutk` cookie goes along only when the stored cookie choice is "accepted".
 * The qualification answers are sent by the CRM's internal values, never by their labels.
 */

type TextField = "firstname" | "lastname" | "phone" | "email" | "clube";
type FieldName = TextField | "gestao" | "lembretes" | "tempo" | "consent";

interface FormState {
  firstname: string;
  lastname: string;
  phone: string;
  email: string;
  clube: string;
  gestao: string[];
  lembretes: string;
  tempo: string;
  consent: boolean;
  marketing: boolean;
}
type Errors = Partial<Record<FieldName, string>>;

const EMPTY: FormState = {
  firstname: "",
  lastname: "",
  phone: "",
  email: "",
  clube: "",
  gestao: [],
  lembretes: "",
  tempo: "",
  consent: false,
  marketing: false,
};

// The server's limits (demo_request_service.validate), so a value the form accepts is never a 400.
const requiredText = z.string().trim().min(1).max(200);

const schema = z.object({
  firstname: requiredText,
  lastname: requiredText,
  phone: z.string().refine((v) => normalisePhone(v) !== null),
  email: z.string().trim().email().max(200),
  clube: requiredText,
  gestao: z.array(z.enum(GESTAO_VALUES)).min(1),
  lembretes: z.enum(LEMBRETES_VALUES),
  tempo: z.enum(TEMPO_VALUES),
  consent: z.literal(true),
});

/** The form's order: focus goes to the first of these with an error. */
const FIELDS: FieldName[] = [
  "firstname", "lastname", "phone", "email", "clube", "gestao", "lembretes", "tempo", "consent",
];

/** The element focus moves to for each field (a group's first option). */
const focusId = (f: FieldName) =>
  f === "gestao"
    ? `demo-gestao-${GESTAO_VALUES[0]}`
    : f === "lembretes" || f === "tempo"
      ? `demo-${f}-group`
      : `demo-${f}-input`;

function hubspotUtk(): string | null {
  // The cookie alone is not consent: a lapsed or declined choice may leave it behind on
  // HubSpot's parent domain, out of the page's reach (rule 13).
  if (readConsent() !== "accepted") return null;
  const m = document.cookie.match(/(?:^|;\s*)hubspotutk=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

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
  const { t, i18n } = useTranslation();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sent, setSent] = useState(false);
  const openedAt = useRef(0);

  useEffect(() => {
    // Every open starts clean; the fill time counts from the open.
    setForm(EMPTY);
    setWebsite("");
    setErrors({});
    setSending(false);
    setFailed(false);
    setSent(false);
    if (open) openedAt.current = performance.now();
  }, [open]);

  /** Move focus to the first field with an error, in the form's order (WCAG 3.3.1). */
  const focusFirstInvalid = (errs: Errors) => {
    const first = FIELDS.find((f) => errs[f]);
    if (first) requestAnimationFrame(() => document.getElementById(focusId(first))?.focus());
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key as FieldName] ? { ...e, [key]: undefined } : e));
  };

  const toggleGestao = (value: string, on: boolean) =>
    set(
      "gestao",
      // Kept in the CRM's option order, whatever order they were ticked in.
      GESTAO_VALUES.filter((v) => (v === value ? on : form.gestao.includes(v))),
    );

  const send = async () => {
    setErrors({});
    setFailed(false);
    setSending(true);
    const utk = hubspotUtk();
    const result = await sendDemoRequest({
      firstname: form.firstname.trim(),
      lastname: form.lastname.trim(),
      phone: normalisePhone(form.phone) as string,
      email: form.email.trim(),
      clube: form.clube.trim(),
      gestao: form.gestao,
      lembretes: form.lembretes,
      tempo: form.tempo,
      consent: true,
      marketing: showMarketing && form.marketing,
      ...(pedido ? { pedido } : {}),
      lang: i18n?.language?.startsWith("en") ? "en" : "pt",
      ...(utk ? { hutk: utk } : {}),
      pageUri: window.location.href,
      pageName: document.title,
      website,
      elapsedMs: Math.round(performance.now() - openedAt.current),
    });
    setSending(false);
    if (result.ok) {
      setSent(true);
      return;
    }
    const field = result.field as FieldName | undefined;
    if (result.status === 400 && field && FIELDS.includes(field)) {
      setErrors({ [field]: t(`landing.demo.errors.${field}`) });
      focusFirstInvalid({ [field]: "x" });
      return;
    }
    setFailed(true);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as FieldName;
        next[key] = t(`landing.demo.errors.${key}`);
      }
      setErrors(next);
      focusFirstInvalid(next);
      return;
    }
    await send();
  };

  const describedBy = (name: FieldName) => ({
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `demo-${name}-error` : undefined,
  });

  const error = (name: FieldName) =>
    errors[name] ? (
      <p
        id={`demo-${name}-error`}
        role="alert"
        data-testid={`demo-${name}-error`}
        className="text-xs text-destructive"
      >
        {errors[name]}
      </p>
    ) : null;

  const text = (name: TextField, extra: { type?: string; autoComplete?: string } = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`demo-${name}-input`}>{t(`landing.demo.fields.${name}`)}</Label>
      <Input
        id={`demo-${name}-input`}
        data-testid={`demo-${name}`}
        {...describedBy(name)}
        type={extra.type ?? "text"}
        autoComplete={extra.autoComplete}
        placeholder={t(`landing.demo.placeholders.${name}`)}
        value={form[name]}
        onChange={(e) => set(name, e.target.value)}
      />
      {error(name)}
    </div>
  );

  // Each option is a full-width row of at least 44px, so the label is the touch target.
  const optionRow = "flex min-h-11 items-center gap-3 rounded-md px-1 text-sm font-normal leading-snug";

  const single = (name: "lembretes" | "tempo", values: readonly string[]) => (
    <fieldset className="space-y-1.5">
      <legend id={`demo-${name}-legend`} className="text-sm font-medium leading-snug">
        {t(`landing.demo.questions.${name}.label`)}
      </legend>
      <RadioGroup
        id={`demo-${name}-group`}
        aria-labelledby={`demo-${name}-legend`}
        {...describedBy(name)}
        value={form[name]}
        onValueChange={(v) => set(name, v)}
        className="gap-0"
      >
        {values.map((v) => (
          <Label key={v} htmlFor={`demo-${name}-${v}-input`} className={optionRow}>
            <RadioGroupItem id={`demo-${name}-${v}-input`} data-testid={`demo-${name}-${v}`} value={v} />
            {t(`landing.demo.questions.${name}.options.${v}`)}
          </Label>
        ))}
      </RadioGroup>
      {error(name)}
    </fieldset>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="demo-dialog"
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>{t("landing.demo.title")}</DialogTitle>
          <DialogDescription>{t("landing.demo.subtitle")}</DialogDescription>
          <p data-testid="demo-hubspot-notice" className="text-sm text-muted-foreground">
            {t("landing.demo.providedBy")}
          </p>
        </DialogHeader>
        {sent ? (
          <div data-testid="demo-sent" className="space-y-4" role="status">
            <p className="text-base font-semibold">{t("landing.demo.sent.message")}</p>
            <Button type="button" data-testid="demo-close" onClick={() => onOpenChange(false)}>
              {t("landing.demo.close")}
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {text("firstname", { autoComplete: "given-name" })}
              {text("lastname", { autoComplete: "family-name" })}
            </div>
            {text("phone", { type: "tel", autoComplete: "tel" })}
            {text("email", { type: "email", autoComplete: "email" })}
            {text("clube", { autoComplete: "organization" })}
            <fieldset className="space-y-1.5" {...describedBy("gestao")}>
              <legend className="text-sm font-medium leading-snug">
                {t("landing.demo.questions.gestao.label")}
              </legend>
              <div>
                {GESTAO_VALUES.map((v) => (
                  <Label key={v} htmlFor={`demo-gestao-${v}`} className={optionRow}>
                    <Checkbox
                      id={`demo-gestao-${v}`}
                      data-testid={`demo-gestao-${v}`}
                      checked={form.gestao.includes(v)}
                      onCheckedChange={(c) => toggleGestao(v, c === true)}
                    />
                    {t(`landing.demo.questions.gestao.options.${v}`)}
                  </Label>
                ))}
              </div>
              {error("gestao")}
            </fieldset>
            {single("lembretes", LEMBRETES_VALUES)}
            {single("tempo", TEMPO_VALUES)}
            {/* Honeypot: a person never sees or reaches it (inert: out of the tab order and the
                accessibility tree); a bot that fills every input fills it. */}
            <div
              {...{ inert: "" }}
              style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}
            >
              <input
                type="text"
                name="website"
                data-testid="demo-website"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{t("landing.demo.consentIntro")}</p>
              <Label htmlFor="demo-consent-input" className={optionRow}>
                <Checkbox
                  id="demo-consent-input"
                  data-testid="demo-consent"
                  {...describedBy("consent")}
                  checked={form.consent}
                  onCheckedChange={(v) => set("consent", v === true)}
                />
                {t("landing.demo.consent")}
              </Label>
              {error("consent")}
              {showMarketing && (
                <Label htmlFor="demo-marketing-input" className={optionRow}>
                  <Checkbox
                    id="demo-marketing-input"
                    data-testid="demo-marketing"
                    checked={form.marketing}
                    onCheckedChange={(v) => set("marketing", v === true)}
                  />
                  {t("landing.demo.marketing")}
                </Label>
              )}
              <p data-testid="demo-privacy-line" className="text-sm text-muted-foreground">
                {t("landing.demo.privacyLine")}{" "}
                <ExitLink to="/privacy" className="underline">
                  {t("landing.demo.privacyLink")}
                </ExitLink>
                .
              </p>
            </div>
            {failed && (
              <div data-testid="demo-failed" role="alert" className="space-y-2 text-sm text-destructive">
                <p>
                  {t("landing.demo.failed")}{" "}
                  <a
                    data-testid="demo-failed-mailto"
                    href={fallbackHref}
                    className="font-semibold underline"
                  >
                    {t("landing.demo.failedLink")}
                  </a>
                </p>
                <Button
                  type="button"
                  variant="outline"
                  data-testid="demo-retry"
                  disabled={sending}
                  onClick={() => void send()}
                >
                  {t("landing.demo.retry")}
                </Button>
              </div>
            )}
            <Button type="submit" data-testid="demo-submit" disabled={sending} className="w-full">
              {sending ? t("landing.demo.sending") : t("landing.demo.submit")}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
