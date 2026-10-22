/**
 * PAD-656: the building blocks every audience page is made of, as the FINAL design draws them
 * (section rhythm 112 px, 72 px ≤ 640; eyebrow + heading with a blue second line; green ticks;
 * cards radius 24 with the design's soft shadow). Layout primitives only: no copy lives here.
 */
import { Check, Smartphone } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { APP_STORE_URL } from "@levelup/config";

import { cn } from "@/lib/utils";

export const cardShadow = "shadow-[0_24px_48px_-32px_rgba(13,27,49,0.28)]";

type Tone = "white" | "grey" | "navy";

const TONE: Record<Tone, string> = {
  white: "bg-white",
  grey: "bg-site-grey",
  navy: "bg-[linear-gradient(150deg,#16294A_0%,#0B1524_100%)] text-site-on-navy",
};

/** One page section: full-bleed background, centred 1240 px content, the anchor offset by the header. */
export function Section({ id, tone = "white", className, children, testId }: { id?: string; tone?: Tone; className?: string; children: ReactNode; testId?: string }) {
  return (
    <section id={id} data-testid={testId} className={cn("scroll-mt-[76px] py-[112px] max-[640px]:py-[72px]", TONE[tone])}>
      <div className={cn("mx-auto min-w-0 max-w-[1240px] px-6", className)}>{children}</div>
    </section>
  );
}

/** Two columns that stack when there is no room (the design's `flex: 1 1 440px`). */
export function TwoColumns({ children, reverse, className }: { children: ReactNode; reverse?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-14 [&>*]:min-w-0 [&>*]:flex-[1_1_420px]", reverse && "flex-row-reverse", className)}>
      {children}
    </div>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-full bg-site-wash px-4 py-1.5 text-[15px] font-semibold text-site-primary">{children}</span>;
}

export function Eyebrow({ children, onNavy }: { children: ReactNode; onNavy?: boolean }) {
  return <p className={cn("text-[13px] font-semibold uppercase tracking-[0.14em]", onNavy ? "text-site-on-navy-muted" : "text-site-primary")}>{children}</p>;
}

/** Heading with the design's blue second line. `level` 1 is the hero, 2 a section, 3 a feature row. */
export function Heading({ level, first, second, onNavy, className }: { level: 1 | 2 | 3; first: string; second?: string; onNavy?: boolean; className?: string }) {
  const Tag = `h${level}` as "h1" | "h2" | "h3";
  const size =
    level === 1
      ? "text-[clamp(50px,6.6vw,100px)] leading-none tracking-[-0.03em]"
      : level === 2
        ? "text-[clamp(38px,4.8vw,70px)] leading-[1.03] tracking-[-0.03em]"
        : "text-[clamp(32px,3.6vw,50px)] leading-[1.06] tracking-[-0.02em]";
  return (
    <Tag className={cn("font-display font-bold [overflow-wrap:anywhere]", size, onNavy ? "text-white" : "text-site-ink", className)}>
      {first}
      {second ? (
        <>
          {" "}
          <span className={cn("block", onNavy ? "text-[#4A9BFF]" : "text-site-primary")}>{second}</span>
        </>
      ) : null}
    </Tag>
  );
}

export function Lead({ children, onNavy, className }: { children: ReactNode; onNavy?: boolean; className?: string }) {
  return <p className={cn("text-[clamp(17px,1.6vw,21px)] leading-[1.6]", onNavy ? "text-site-on-navy-muted" : "text-site-muted", className)}>{children}</p>;
}

export function CheckList({ items, className, testId }: { items: string[]; className?: string; testId?: string }) {
  return (
    <ul className={cn("flex flex-col gap-2.5", className)} data-testid={testId}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-[16px] text-site-ink">
          <Check className="mt-0.5 h-5 w-5 shrink-0 text-site-green" aria-hidden strokeWidth={2.5} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function Card({ children, className, testId }: { children: ReactNode; className?: string; testId?: string }) {
  return (
    <div data-testid={testId} className={cn("min-w-0 rounded-3xl border border-site-border bg-white p-9 max-[640px]:p-[26px]", cardShadow, className)}>
      {children}
    </div>
  );
}

/** A benefit card: icon tile, title, description, ticks. */
export function FeatureCard({ icon, title, body, checks, className, children, testId }: { icon: ReactNode; title: string; body: string; checks: string[]; className?: string; children?: ReactNode; testId?: string }) {
  return (
    <Card className={className} testId={testId}>
      <div className="flex flex-col gap-5">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-site-wash text-site-primary" aria-hidden>
          {icon}
        </span>
        <h3 className="font-display text-[24px] font-bold leading-tight tracking-[-0.02em] text-site-ink">{title}</h3>
        <p className="text-[17px] leading-[1.65] text-site-muted">{body}</p>
        <CheckList items={checks} />
        {children}
      </div>
    </Card>
  );
}

/** Text with an eyebrow, a heading, a body and ticks beside a mockup; `reverse` puts the mockup first. */
export function FeatureRow({ eyebrow, title, body, checks, mockup, reverse, testId }: { eyebrow: string; title: string; body: string; checks: string[]; mockup: ReactNode; reverse?: boolean; testId?: string }) {
  return (
    <div data-testid={testId} className="pt-24 max-[640px]:pt-16">
      <TwoColumns reverse={reverse}>
        <div className="flex flex-col gap-6">
          <Eyebrow>{eyebrow}</Eyebrow>
          <Heading level={3} first={title} />
          <Lead>{body}</Lead>
          <CheckList items={checks} />
        </div>
        <div className="flex justify-center">{mockup}</div>
      </TwoColumns>
    </div>
  );
}

export function NumberedSteps({ steps, testId }: { steps: { title: string; body: string }[]; testId?: string }) {
  return (
    <ol className="flex flex-col gap-7" data-testid={testId}>
      {steps.map((step, i) => (
        <li key={step.title} className="flex gap-5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-site-wash font-display text-[17px] font-bold text-site-primary" aria-hidden>
            {String(i + 1).padStart(2, "0")}
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <h3 className="font-display text-[24px] font-bold leading-tight tracking-[-0.02em] text-site-ink">{step.title}</h3>
            <p className="text-[17px] leading-[1.65] text-site-muted">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** The results figures on navy. */
export function Stats({ items, testId }: { items: { value: string; label: string }[]; testId?: string }) {
  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-8" data-testid={testId}>
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-2">
          <dt className="sr-only">{item.label}</dt>
          <dd className="font-display text-[clamp(44px,4.4vw,60px)] font-bold leading-none tabular-nums text-white">{item.value}</dd>
          <dd className="text-[17px] text-site-on-navy-muted">{item.label}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Quote({ text, initials, name, role }: { text: string; initials: string; name: string; role: string }) {
  return (
    <figure className="flex flex-col gap-5 rounded-[22px] border border-white/15 bg-white/5 p-8">
      <blockquote className="text-[19px] leading-[1.6] text-site-on-navy">{text}</blockquote>
      <figcaption className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-site-primary font-display text-[15px] font-bold text-white" aria-hidden>
          {initials}
        </span>
        <span className="flex flex-col">
          <span className="font-semibold text-white">{name}</span>
          <span className="text-[15px] text-site-on-navy-muted">{role}</span>
        </span>
      </figcaption>
    </figure>
  );
}

/** "Descarrega na App Store" (live, PAD-619) and "Em breve na Google Play" (not a link). */
export function StoreBadges({ placement }: { placement: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-3">
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="site-app-store"
        data-placement={placement}
        className="inline-flex min-h-[56px] items-center gap-3 rounded-xl bg-site-navy-deep px-5 text-white transition-colors hover:bg-site-navy"
      >
        <Smartphone className="size-5 shrink-0" aria-hidden />
        <span className="flex flex-col items-start leading-tight">
          <span className="text-[11px] font-medium opacity-80">{t("site.store.appStoreEyebrow")}</span>
          <span className="text-[17px] font-semibold">{t("site.store.appStore")}</span>
        </span>
        <span className="sr-only">{t("site.store.newTab")}</span>
      </a>
      <span data-testid="site-google-play" className="inline-flex min-h-[56px] items-center gap-3 rounded-xl border border-dashed border-site-border-strong px-5 text-site-muted">
        <span className="flex flex-col items-start leading-tight">
          <span className="text-[11px] font-medium">{t("site.store.soonEyebrow")}</span>
          <span className="text-[17px] font-semibold">{t("site.store.googlePlay")}</span>
        </span>
      </span>
    </div>
  );
}

/** The closing card on grey: heading, line, two actions. */
export function ClosingCta({ title, body, actions, testId }: { title: string; body: string; actions: ReactNode; testId?: string }) {
  return (
    <Section tone="grey" testId={testId}>
      <Card className="flex flex-col items-center gap-6 px-8 py-[88px] text-center max-[640px]:py-14">
        <Heading level={2} first={title} />
        <Lead className="max-w-[640px]">{body}</Lead>
        <div className="flex flex-wrap justify-center gap-3">{actions}</div>
      </Card>
    </Section>
  );
}

/** A CSS-drawn phone for the chat and lock-screen mockups (bezel, notch, status bar). */
export function Phone({ children, time = "17:42", className, label }: { children: ReactNode; time?: string; className?: string; label?: string }) {
  return (
    <div
      role={label ? "img" : undefined}
      aria-label={label}
      className={cn("relative w-[270px] max-w-full shrink-0 overflow-hidden rounded-[40px] border-[9px] border-[#12161C] bg-white", cardShadow, className)}
    >
      <div className="flex h-8 items-center justify-between px-5 text-[12px] font-semibold text-site-ink" aria-hidden>
        <span>{time}</span>
        <span className="h-5 w-24 rounded-b-2xl bg-[#12161C]" />
        <span>82</span>
      </div>
      <div className="min-h-[480px]">{children}</div>
    </div>
  );
}
