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
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { sendDemoRequest, type DemoPedido, type DemoRequestResult } from "@/lib/demoRequest";

/**
 * The "Pedir demonstração" dialog (PAD-469, PAD-617; auth.landing-page rule 10).
 * LevApp's own form: it posts to `/api/public/demo-request` and never reaches a
 * HubSpot host, so it neither waits for the cookie choice nor loads the tracking
 * script. The visitor's `hubspotutk` cookie goes along only when it exists.
 */

type FieldName =
  | "fullname"
  | "email"
  | "phone"
  | "company"
  | "city"
  | "alunos"
  | "horas"
  | "message"
  | "consent";

type FormState = Record<Exclude<FieldName, "consent">, string> & { consent: boolean };
type Errors = Partial<Record<FieldName, string>>;

const EMPTY: FormState = {
  fullname: "",
  email: "",
  phone: "",
  company: "",
  city: "",
  alunos: "",
  horas: "",
  message: "",
  consent: false,
};

const positiveInt = z.string().trim().regex(/^\d+$/).refine((v) => Number(v) > 0);

const schema = z.object({
  fullname: z.string().trim().min(2),
  email: z.string().trim().email(),
  phone: z.string().trim().min(9),
  company: z.string().trim().min(2),
  city: z.string().trim().min(2),
  alunos: positiveInt,
  horas: positiveInt,
  message: z.string().max(2000),
  consent: z.literal(true),
});

const FIELDS: FieldName[] = [
  "fullname", "email", "phone", "company", "city", "alunos", "horas", "message", "consent",
];

function hubspotUtk(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)hubspotutk=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function DemoRequestDialog({
  open,
  onOpenChange,
  fallbackHref,
  pedido = "demonstracao",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fallbackHref: string;
  pedido?: DemoPedido;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sentName, setSentName] = useState<string | null>(null);
  const openedAt = useRef(0);

  useEffect(() => {
    // Every open starts clean; the fill time counts from the open.
    setForm(EMPTY);
    setWebsite("");
    setErrors({});
    setSending(false);
    setFailed(false);
    setSentName(null);
    if (open) openedAt.current = performance.now();
  }, [open]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
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
      return;
    }
    setErrors({});
    setFailed(false);
    setSending(true);
    const utk = hubspotUtk();
    const result = await sendDemoRequest({
      fullname: form.fullname.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      company: form.company.trim(),
      city: form.city.trim(),
      alunos: Number(form.alunos),
      horas: Number(form.horas),
      message: form.message.trim(),
      consent: true,
      pedido,
      ...(utk ? { hutk: utk } : {}),
      pageUri: window.location.href,
      pageName: document.title,
      website,
      elapsedMs: Math.round(performance.now() - openedAt.current),
    });
    setSending(false);
    if (result.ok) {
      setSentName(form.fullname.trim().split(/\s+/)[0]);
      return;
    }
    // The web tsconfig is not strict, so the union does not narrow on `ok`.
    const bad = result as Exclude<DemoRequestResult, { ok: true }>;
    const field = bad.field as FieldName | undefined;
    if (bad.status === 400 && field && FIELDS.includes(field)) {
      setErrors({ [field]: t(`landing.demo.errors.${field}`) });
      return;
    }
    setFailed(true);
  };

  const fieldProps = (name: FieldName) => ({
    id: `demo-${name}-input`,
    "data-testid": `demo-${name}`,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `demo-${name}-error` : undefined,
  });

  const error = (name: FieldName) =>
    errors[name] ? (
      <p
        id={`demo-${name}-error`}
        data-testid={`demo-${name}-error`}
        className="text-xs text-destructive"
      >
        {errors[name]}
      </p>
    ) : null;

  const text = (
    name: Exclude<FieldName, "consent" | "message" | "alunos" | "horas">,
    extra: { type?: string; autoComplete?: string } = {},
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`demo-${name}-input`}>{t(`landing.demo.fields.${name}`)}</Label>
      <Input
        {...fieldProps(name)}
        type={extra.type ?? "text"}
        autoComplete={extra.autoComplete}
        placeholder={t(`landing.demo.placeholders.${name}`)}
        value={form[name]}
        onChange={(e) => set(name, e.target.value)}
      />
      {error(name)}
    </div>
  );

  const count = (name: "alunos" | "horas") => (
    <div className="space-y-1.5">
      <Label htmlFor={`demo-${name}-input`}>{t(`landing.demo.fields.${name}`)}</Label>
      <Input
        {...fieldProps(name)}
        type="number"
        min={1}
        step={1}
        inputMode="numeric"
        value={form[name]}
        onChange={(e) => set(name, e.target.value)}
      />
      {error(name)}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="demo-dialog"
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            {t("landing.demo.eyebrow")}
          </p>
          <DialogTitle>{t("landing.demo.title")}</DialogTitle>
          <DialogDescription>{t("landing.demo.subtitle")}</DialogDescription>
          <p data-testid="demo-hubspot-notice" className="text-sm text-muted-foreground">
            {t("landing.demo.providedBy")}{" "}
            <ExitLink to="/privacy" className="underline">
              {t("landing.demo.privacyLink")}
            </ExitLink>
          </p>
        </DialogHeader>
        {sentName !== null ? (
          <div data-testid="demo-sent" className="space-y-4" role="status">
            <h3 className="text-lg font-semibold">
              {t("landing.demo.sent.title", { name: sentName })}
            </h3>
            <p className="text-sm text-muted-foreground">{t("landing.demo.sent.message")}</p>
            <Button type="button" data-testid="demo-close" onClick={() => onOpenChange(false)}>
              {t("landing.demo.close")}
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            {text("fullname", { autoComplete: "name" })}
            {text("email", { type: "email", autoComplete: "email" })}
            {text("phone", { type: "tel", autoComplete: "tel" })}
            {text("company", { autoComplete: "organization" })}
            {text("city", { autoComplete: "address-level2" })}
            <div className="grid gap-4 sm:grid-cols-2">
              {count("alunos")}
              {count("horas")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="demo-message-input">{t("landing.demo.fields.message")}</Label>
              <Textarea
                {...fieldProps("message")}
                rows={3}
                placeholder={t("landing.demo.placeholders.message")}
                value={form.message}
                onChange={(e) => set("message", e.target.value)}
              />
              {error("message")}
            </div>
            {/* Honeypot: a person never sees or reaches it; a bot fills it. */}
            <div
              aria-hidden="true"
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
            <div className="space-y-1.5">
              <div className="flex items-start gap-2">
                <Checkbox
                  {...fieldProps("consent")}
                  checked={form.consent}
                  onCheckedChange={(v) => set("consent", v === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="demo-consent-input" className="text-sm font-normal leading-snug">
                  {t("landing.demo.consent")} (
                  <ExitLink to="/privacy" className="underline">
                    {t("landing.demo.privacyLink")}
                  </ExitLink>
                  ).
                </Label>
              </div>
              {error("consent")}
            </div>
            {failed && (
              <p data-testid="demo-failed" role="alert" className="text-sm text-destructive">
                {t("landing.demo.failed")}{" "}
                <a
                  data-testid="demo-failed-mailto"
                  href={fallbackHref}
                  className="font-semibold underline"
                >
                  {t("landing.demo.failedLink")}
                </a>
              </p>
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
