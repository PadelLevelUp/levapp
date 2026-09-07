/**
 * The public page — what a visitor sees at `/` with no session.
 *
 * Web-only, and deliberately so — the "web and iOS ship together" rule in
 * CLAUDE.md wants that reason written down. It was scoped to the web app when
 * it was asked for ("for the webapp only"), and it is also the shape of surface
 * that carve-out is for: a logged-out page for academy owners and players
 * choosing software, where the iOS equivalent is the App Store listing. The
 * loader this page hands off to is NOT web-only — iOS has had the same
 * animation on cold start since the launch-animation work.
 *
 * Second iteration (2026-09-06). Ported from the Lovable project
 * "Padellevelup Playground" (`src/routes/index.tsx` there), which replaced the
 * first hand-built page. What changed in the port, so the next person doesn't
 * have to diff two codebases:
 *   - The Lovable page is TanStack Router + hard-coded Portuguese. Here it is
 *     react-router (`Link`) and every string goes through i18n
 *     (`locales/{pt,en}/landing.json`), the same as every other screen.
 *   - Lovable's `btn-primary` / `btn-outline` / `eyebrow` / `shadow-*` /
 *     `navy-*` utilities don't exist in this app. Buttons are the app's
 *     `Button`; the navy blocks are painted with the brand navy directly
 *     (same reasoning as before: they are navy *in the brand*, and
 *     token-driving them would turn them white in light mode).
 *   - The audience tabs (coaches / players / others) are the page's one piece
 *     of state. `?audience=` seeds it so a link can open the page on a
 *     specific audience; switching tabs does not rewrite the URL.
 *   - Device renders are real frame PNGs (transparent screen area) with the
 *     app screenshot layered underneath, all under `/public/landing/`. They
 *     are screenshots of the real app, so they are Portuguese in both
 *     locales — that is the product, not copy.
 *
 * CTA destinations, same decisions as the first iteration:
 *   - "Pedir demonstração" -> mailto the support address. There is no
 *     demo-request endpoint, and inventing a form here would mean a backend
 *     change this page doesn't need.
 *   - "Enviar ideia" (others) -> mailto the admin address.
 *   - "Ver como funciona" / the nav links -> in-page anchors.
 *   - "Recebi um convite" -> /support. Invitations are tokenised links
 *     (`/invite/player/:token`) sent by message, so there is no tokenless
 *     entry point to send someone to; a player holding a dead or missing
 *     invite needs a human, which is what /support is for.
 */
import { useState, type ComponentType, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Mail,
  Menu,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The brand navy, as a gradient. Matches the loader and the app's chrome. */
const NAVY = "linear-gradient(150deg, #16294A 0%, #0B1524 100%)";
const NAVY_DEEP = "#0B1524";
const NAVY_MUTED = "#A9BCD6";
const NAVY_BORDER = "#2E4460";

const SUPPORT_CONTACT_EMAIL = "padellevelup2026@gmail.com";
const ADMIN_CONTACT_EMAIL = "admin@levapp.pt";

const SECTION_BENEFITS = "vantagens";
const SECTION_HOW = "como-funciona";
const SECTION_RESULTS = "resultados";

const MARK_ON_DARK = "/brand/levapp-mark-on-dark.svg";

export type Audience = "coaches" | "players" | "others";
const AUDIENCES: Audience[] = ["coaches", "players", "others"];

/** `?audience=` accepts both the i18n ids and the Portuguese slugs Lovable used. */
const AUDIENCE_ALIASES: Record<string, Audience> = {
  coaches: "coaches",
  treinadores: "coaches",
  players: "players",
  alunos: "players",
  others: "others",
  outros: "others",
};

function readAudience(raw: string | null): Audience {
  return (raw && AUDIENCE_ALIASES[raw.toLowerCase()]) || "coaches";
}

const mailto = (address: string, subject: string) =>
  `mailto:${address}?subject=${encodeURIComponent(subject)}`;

/* ---------------------------------- chrome --------------------------------- */

function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display font-bold tracking-tight", className)}>
      Lev<span className="text-primary">App</span>
    </span>
  );
}

function BrandLockup({
  markSize,
  textClass,
}: {
  markSize: number;
  textClass: string;
}) {
  return (
    <a href="/" className="flex items-center gap-2.5">
      <img
        src="/brand/levapp-icon.svg"
        alt=""
        aria-hidden="true"
        width={markSize}
        height={markSize}
        className="rounded-[23%]"
        style={{ width: markSize, height: markSize }}
      />
      <Wordmark className={textClass} />
    </a>
  );
}

const eyebrowClass = "text-[12px] font-semibold uppercase tracking-[0.12em]";
const cardShadow = "shadow-[0_8px_24px_-12px_rgba(13,27,49,0.25)]";
const mockShadow = "shadow-[0_24px_48px_-24px_rgba(13,27,49,0.35)]";
const hoverMockShadow = "hover:shadow-[0_24px_48px_-24px_rgba(13,27,49,0.35)]";

/* --------------------------------- devices --------------------------------- */

/**
 * Real device renders: the screen area is transparent in the frame image, so
 * the screenshot sits underneath and the bezel masks its edges. The insets are
 * where the screen sits inside each frame, as a percentage of the frame.
 */
const FRAMES = {
  iphone: {
    src: "/landing/iphone-frame.png",
    w: 800,
    h: 1745,
    left: 4.0,
    top: 1.78,
    width: 91.63,
    height: 97.08,
  },
  macbook: {
    src: "/landing/macbook-frame.png",
    w: 1681,
    h: 1137,
    left: 10.11,
    top: 2.02,
    width: 79.89,
    height: 77.4,
  },
  watch: {
    src: "/landing/watch-frame.png",
    w: 316,
    h: 520,
    left: 12.03,
    top: 22.12,
    width: 71.52,
    height: 52.69,
  },
} as const;

const SCREENS = {
  calendar: "/landing/screen-calendario.png",
  messages: "/landing/screen-mensagens.png",
  presences: "/landing/screen-presencas.png",
  training: "/landing/screen-treino.png",
  mobileDashboard: "/landing/screen-movel-painel.png",
  mobilePresences: "/landing/screen-movel-presencas.png",
  mobileMessages: "/landing/screen-movel-mensagens.png",
  mobilePresencesCoach: "/landing/screen-movel-presencas-treinador.png",
  mobileDashboardCoach: "/landing/screen-movel-painel-treinador.png",
} as const;

function DeviceFrame({
  kind,
  className,
  eager,
  children,
}: {
  kind: keyof typeof FRAMES;
  className: string;
  eager?: boolean;
  children: ReactNode;
}) {
  const f = FRAMES[kind];
  return (
    <div className={className}>
      <div
        className="relative w-full drop-shadow-[0_30px_50px_rgba(15,23,42,0.28)]"
        style={{ aspectRatio: `${f.w} / ${f.h}` }}
      >
        <div
          className="absolute overflow-hidden bg-black"
          style={{
            left: `${f.left}%`,
            top: `${f.top}%`,
            width: `${f.width}%`,
            height: `${f.height}%`,
          }}
        >
          {children}
        </div>
        <img
          src={f.src}
          alt=""
          width={f.w}
          height={f.h}
          loading={eager ? "eager" : "lazy"}
          className="pointer-events-none relative h-full w-full select-none"
          draggable={false}
        />
      </div>
    </div>
  );
}

type ShotProps = {
  src: string;
  alt: string;
  eager?: boolean;
  className?: string;
};

function PhoneShot({ src, alt, eager = false, className }: ShotProps) {
  return (
    <DeviceFrame
      kind="iphone"
      className={className ?? "relative mx-auto w-[280px]"}
      eager={eager}
    >
      <img
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        className="h-full w-full object-cover object-top"
      />
    </DeviceFrame>
  );
}

function LaptopShot({ src, alt, eager = false, className }: ShotProps) {
  return (
    <DeviceFrame
      kind="macbook"
      className={className ?? "relative w-full"}
      eager={eager}
    >
      <img
        src={src}
        alt={alt}
        loading={eager ? "eager" : "lazy"}
        className="h-full w-full object-cover object-left-top"
      />
    </DeviceFrame>
  );
}

function WatchShot({
  variant,
  className,
}: {
  variant: "filled" | "invite";
  className?: string;
}) {
  const { t } = useTranslation();
  const isInvite = variant === "invite";
  const text = t(`landing.watch.${variant}.title`);
  const meta = t(`landing.watch.${variant}.meta`);

  return (
    <div aria-label={t("landing.watch.label", { text })} className="contents">
      <DeviceFrame
        kind="watch"
        className={className ?? "relative mx-auto w-[168px]"}
      >
        <div
          className="flex h-full w-full flex-col bg-black px-[7%] pb-[7%] pt-[9%] text-white"
          style={{ containerType: "inline-size" }}
        >
          <div className="flex items-center justify-between text-[6cqw] font-medium text-white/60">
            <span className="flex items-center gap-[3cqw]">
              <img src={MARK_ON_DARK} alt="" className="h-[7cqw] w-[9cqw]" />
              LevApp
            </span>
            <span>{t("landing.watch.now")}</span>
          </div>
          <div className="mt-[5cqw] flex flex-1 flex-col items-center justify-center rounded-[10cqw] bg-[#15171d] px-[6cqw] py-[5cqw] text-center">
            <span
              className={cn(
                "flex h-[19cqw] w-[19cqw] items-center justify-center rounded-full shadow-[0_0_0_3cqw_rgba(47,138,255,0.25)]",
                isInvite ? "bg-success" : "bg-primary",
              )}
            >
              {isInvite ? (
                <Bell className="h-[11cqw] w-[11cqw] text-white" strokeWidth={3} />
              ) : (
                <Check className="h-[11cqw] w-[11cqw] text-white" strokeWidth={3} />
              )}
            </span>
            <p className="mt-[5cqw] text-[7cqw] font-semibold leading-[1.25] text-white">
              {text}
            </p>
            <p className="mt-[3cqw] text-[5.5cqw] text-white/50">{meta}</p>
          </div>
        </div>
      </DeviceFrame>
    </div>
  );
}

function CoachHeroMockup() {
  const { t } = useTranslation();
  return (
    <div className="relative mx-auto w-full max-w-[720px] pb-20 pl-8 pt-6 sm:pl-14">
      <LaptopShot src={SCREENS.calendar} alt={t("landing.alt.calendar")} eager />
      <PhoneShot
        src={SCREENS.mobileDashboardCoach}
        alt={t("landing.alt.mobileDashboardCoach")}
        eager
        className="absolute -right-3 bottom-0 hidden w-[140px] sm:block"
      />
      <WatchShot
        variant="filled"
        className="absolute -bottom-6 left-0 hidden w-[130px] sm:block lg:w-[150px]"
      />
    </div>
  );
}

function PlayerHeroMockup() {
  const { t } = useTranslation();
  return (
    <div className="relative mx-auto flex w-full max-w-[460px] items-end justify-center gap-6 pb-10 pt-10">
      <WatchShot variant="invite" className="relative mb-10 hidden w-[160px] sm:block" />
      <PhoneShot
        src={SCREENS.mobileDashboard}
        alt={t("landing.alt.mobileDashboard")}
        eager
        className="relative w-[260px]"
      />
    </div>
  );
}

function OthersMockup() {
  const { t } = useTranslation();
  return (
    <div className={cn("rounded-3xl border border-border bg-muted p-8", mockShadow)}>
      <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-10 text-center">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-secondary text-primary">
          <Sparkles className="size-8" />
        </span>
        <p className="mt-6 font-display text-xl font-bold">
          {t("landing.others.mockupTitle")}
        </p>
        <p className="mt-2 max-w-[260px] text-sm leading-relaxed text-muted-foreground">
          {t("landing.others.mockupBody")}
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------- header --------------------------------- */

function Header({ demoHref }: { demoHref: string }) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = [
    { id: SECTION_BENEFITS, label: t("landing.nav.benefits") },
    { id: SECTION_HOW, label: t("landing.nav.how") },
    { id: SECTION_RESULTS, label: t("landing.nav.results") },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto flex h-[68px] max-w-[1170px] items-center gap-6 px-5 sm:h-[76px] lg:gap-10 lg:px-6">
        <BrandLockup markSize={32} textClass="text-xl sm:text-2xl" />

        <nav className="hidden items-center gap-7 text-[15px] font-medium text-muted-foreground md:flex">
          {navLinks.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              className="transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex-1" />

        <div className="flex items-center gap-3">
          <Button asChild variant="outline" className="bg-card">
            <Link to="/auth">{t("landing.nav.login")}</Link>
          </Button>
          <Button asChild className="hidden md:inline-flex">
            <a href={demoHref}>{t("landing.nav.demo")}</a>
          </Button>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? t("landing.nav.closeMenu") : t("landing.nav.openMenu")}
            className="grid h-11 w-11 place-items-center rounded-md text-foreground md:hidden"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <nav className="flex flex-col border-t border-border px-5 py-2 md:hidden">
          {navLinks.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              onClick={() => setMenuOpen(false)}
              className="flex h-12 items-center text-[15px] font-medium text-muted-foreground"
            >
              {link.label}
            </a>
          ))}
          <a
            href={demoHref}
            className="flex h-12 items-center text-[15px] font-semibold text-primary"
          >
            {t("landing.nav.demo")}
          </a>
        </nav>
      )}
    </header>
  );
}

function AudienceTabs({
  value,
  onChange,
}: {
  value: Audience;
  onChange: (next: Audience) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="tablist"
      aria-label={t("landing.audience.label")}
      className={cn(
        "inline-flex max-w-full overflow-x-auto rounded-full border border-border bg-card p-1",
        cardShadow,
      )}
    >
      {AUDIENCES.map((id) => {
        const active = id === value;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={cn(
              "whitespace-nowrap rounded-full px-4 py-2.5 text-[14px] font-semibold transition-colors sm:px-5 sm:text-[15px]",
              active
                ? cn("bg-primary text-primary-foreground", cardShadow)
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`landing.audience.${id}`)}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------- hero ---------------------------------- */

function Hero({
  audience,
  demoHref,
  ideaHref,
}: {
  audience: Audience;
  demoHref: string;
  ideaHref: string;
}) {
  const { t } = useTranslation();
  const k = `landing.hero.${audience}`;
  const proof = [1, 2, 3].map((n) => t(`${k}.proof${n}`));

  const primary =
    audience === "coaches" ? (
      <a href={demoHref}>{t(`${k}.primary`)}</a>
    ) : audience === "players" ? (
      <Link to="/auth">{t(`${k}.primary`)}</Link>
    ) : (
      <a href={ideaHref}>{t(`${k}.primary`)}</a>
    );
  const secondary =
    audience === "coaches" ? (
      <a href={`#${SECTION_HOW}`}>{t(`${k}.secondary`)}</a>
    ) : audience === "players" ? (
      <Link to="/support">{t(`${k}.secondary`)}</Link>
    ) : (
      <a href={`#${SECTION_BENEFITS}`}>{t(`${k}.secondary`)}</a>
    );

  return (
    <div className="mx-auto grid max-w-[1170px] items-center gap-14 px-5 pb-16 pt-8 lg:grid-cols-[minmax(0,1fr)_520px] lg:px-6 lg:pb-32 lg:pt-10">
      <div>
        <span className="inline-block rounded-full bg-secondary px-3.5 py-1.5 text-[13px] font-semibold text-secondary-foreground">
          {t(`${k}.badge`)}
        </span>
        <h1 className="mt-6 text-[40px] font-bold leading-[1.05] sm:text-5xl md:text-[58px]">
          {t(`${k}.title1`)}
          <br />
          <span className="text-primary">{t(`${k}.title2`)}</span>
        </h1>
        <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground sm:text-xl">
          {t(`${k}.lead`)}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild size="lg" className="h-[52px] px-8 text-[15px]">
            {primary}
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="h-[52px] bg-card px-8 text-[15px]"
          >
            {secondary}
          </Button>
        </div>
        <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          {proof.map((item) => (
            <li key={item} className="flex items-center gap-2">
              <Check className="size-4 text-success" />
              {item}
            </li>
          ))}
        </ul>
      </div>
      {audience === "others" ? (
        <OthersMockup />
      ) : audience === "coaches" ? (
        <CoachHeroMockup />
      ) : (
        <PlayerHeroMockup />
      )}
    </div>
  );
}

/* -------------------------------- benefits --------------------------------- */

type BenefitDef = { id: string; icon: ComponentType<{ className?: string }> };

const BENEFITS: Record<Exclude<Audience, "others">, BenefitDef[]> = {
  coaches: [
    { id: "time", icon: Clock },
    { id: "money", icon: TrendingUp },
    { id: "competitive", icon: Target },
  ],
  players: [
    { id: "lastMinute", icon: Zap },
    { id: "connect", icon: Users },
    { id: "confirm", icon: CheckCircle2 },
    { id: "competitive", icon: Trophy },
  ],
};

function Benefits({ audience }: { audience: Exclude<Audience, "others"> }) {
  const { t } = useTranslation();
  const items = BENEFITS[audience];
  const k = `landing.benefits.${audience}`;

  return (
    <section id={SECTION_BENEFITS} className="scroll-mt-24 bg-background">
      <div className="mx-auto max-w-[1170px] px-5 py-16 lg:px-6 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
          <div>
            <p className={cn(eyebrowClass, "text-primary")}>{t(`${k}.eyebrow`)}</p>
            <h2 className="mt-4 max-w-2xl text-3xl font-bold leading-tight sm:text-4xl md:text-[44px]">
              {t(`${k}.title`)}
            </h2>

            <div className="mt-10 grid auto-rows-fr gap-6 md:grid-cols-2">
              {items.map(({ id, icon: Icon }, i) => (
                <article
                  key={id}
                  className={cn(
                    "group flex h-full flex-col rounded-2xl border border-border bg-card p-7 transition-all hover:-translate-y-1",
                    cardShadow,
                    hoverMockShadow,
                    items.length === 3 && i === 0 && "md:col-span-2",
                  )}
                >
                  <span className="flex size-12 items-center justify-center rounded-xl bg-secondary text-primary">
                    <Icon className="size-6" />
                  </span>
                  <h3 className="mt-5 text-lg font-bold leading-tight">
                    {t(`${k}.items.${id}.title`)}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {t(`${k}.items.${id}.text`)}
                  </p>
                  <ul className="mt-auto space-y-1.5 border-t border-border pt-4 text-sm text-muted-foreground">
                    {[1, 2, 3].map((n) => (
                      <li key={n} className="flex items-start gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-success" />
                        {t(`${k}.items.${id}.bullet${n}`)}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>

          <div className="hidden lg:block">
            {audience === "coaches" ? (
              <div className="relative pb-10 pr-6">
                <LaptopShot src={SCREENS.messages} alt={t("landing.alt.messages")} />
                <PhoneShot
                  src={SCREENS.mobileMessages}
                  alt={t("landing.alt.mobileMessages")}
                  className="absolute -bottom-2 right-0 w-[150px]"
                />
              </div>
            ) : (
              <PhoneShot
                src={SCREENS.mobilePresences}
                alt={t("landing.alt.mobilePresences")}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------ how it works ------------------------------- */

function HowItWorks({
  audience,
  demoHref,
}: {
  audience: Exclude<Audience, "others">;
  demoHref: string;
}) {
  const { t } = useTranslation();
  const k = `landing.how.${audience}`;

  return (
    <section id={SECTION_HOW} className="scroll-mt-24 bg-card">
      <div className="mx-auto max-w-[1170px] px-5 py-16 lg:px-6 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_520px] lg:items-center">
          <div className="order-2 lg:order-1">
            {audience === "coaches" ? (
              <div className="relative pb-10 pr-6">
                <LaptopShot src={SCREENS.presences} alt={t("landing.alt.presences")} />
                <PhoneShot
                  src={SCREENS.mobilePresencesCoach}
                  alt={t("landing.alt.mobilePresencesCoach")}
                  className="absolute -bottom-2 right-0 hidden w-[150px] sm:block"
                />
              </div>
            ) : (
              <PhoneShot
                src={SCREENS.mobileDashboard}
                alt={t("landing.alt.mobileDashboardSteps")}
              />
            )}
          </div>

          <div className="order-1 lg:order-2">
            <p className={cn(eyebrowClass, "text-primary")}>{t("landing.how.eyebrow")}</p>
            <h2 className="mt-4 max-w-xl text-3xl font-bold leading-tight sm:text-4xl md:text-[44px]">
              {t(`${k}.title`)}
            </h2>
            <p className="mt-4 max-w-lg text-lg leading-relaxed text-muted-foreground">
              {t(`${k}.lead`)}
            </p>

            <ol className="mt-10 grid gap-5">
              {[1, 2, 3].map((n) => (
                <li key={n} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary font-display text-sm font-bold text-primary">
                    0{n}
                  </span>
                  <div>
                    <h3 className="text-lg font-bold">{t(`${k}.step${n}.title`)}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {t(`${k}.step${n}.text`)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-8">
              <Button asChild variant="outline" className="bg-card">
                <a href={demoHref}>
                  {t("landing.how.cta")}
                  <ArrowRight className="size-4" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------- results --------------------------------- */

function Results({ audience }: { audience: Exclude<Audience, "others"> }) {
  const { t } = useTranslation();
  const k = `landing.results.${audience}`;

  return (
    <section
      id={SECTION_RESULTS}
      className="scroll-mt-24 text-white"
      style={{ background: NAVY }}
    >
      <div className="mx-auto max-w-[1170px] px-5 py-16 lg:px-6 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
          <div>
            <p className={eyebrowClass} style={{ color: NAVY_MUTED }}>
              {t("landing.results.eyebrow")}
            </p>
            <h2 className="mt-4 text-3xl font-bold leading-tight md:text-[40px]">
              {t(`${k}.title`)}
            </h2>
            <div className="mt-10 grid gap-8 sm:grid-cols-3">
              {[1, 2, 3].map((n) => (
                <div key={n}>
                  <p className="font-display text-4xl font-bold">{t(`${k}.stat${n}.value`)}</p>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: NAVY_MUTED }}>
                    {t(`${k}.stat${n}.label`)}
                  </p>
                </div>
              ))}
            </div>

            <figure
              className="mt-12 rounded-2xl border p-6"
              style={{ borderColor: NAVY_BORDER, background: `${NAVY_DEEP}99` }}
            >
              <blockquote className="text-base leading-relaxed">
                {t(`${k}.quote`)}
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {t(`${k}.initials`)}
                </span>
                <span className="text-sm">
                  <span className="block font-semibold">{t(`${k}.name`)}</span>
                  <span style={{ color: NAVY_MUTED }}>{t(`${k}.role`)}</span>
                </span>
              </figcaption>
            </figure>
          </div>

          <div className="hidden lg:block">
            {audience === "coaches" ? (
              <LaptopShot src={SCREENS.training} alt={t("landing.alt.training")} />
            ) : (
              <PhoneShot
                src={SCREENS.mobilePresences}
                alt={t("landing.alt.mobilePresencesStats")}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------- others --------------------------------- */

function OthersContent({
  ideaHref,
  onShowCoaches,
}: {
  ideaHref: string;
  onShowCoaches: () => void;
}) {
  const { t } = useTranslation();
  return (
    <section id={SECTION_BENEFITS} className="scroll-mt-24 bg-background">
      <div className="mx-auto max-w-[1170px] px-5 py-16 lg:px-6 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
          <div>
            <p className={cn(eyebrowClass, "text-primary")}>{t("landing.others.eyebrow")}</p>
            <h2 className="mt-4 max-w-2xl text-3xl font-bold leading-tight sm:text-4xl md:text-[44px]">
              {t("landing.others.title")}
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              {t("landing.others.body")}{" "}
              <a
                href={`mailto:${ADMIN_CONTACT_EMAIL}`}
                className="text-primary underline underline-offset-4 hover:no-underline"
              >
                {ADMIN_CONTACT_EMAIL}
              </a>
              .
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-[52px] px-8 text-[15px]">
                <a href={ideaHref}>
                  <Mail className="size-4" />
                  {t("landing.others.primary")}
                </a>
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                className="h-[52px] bg-card px-8 text-[15px]"
                onClick={onShowCoaches}
              >
                {t("landing.others.secondary")}
              </Button>
            </div>
          </div>

          <div className={cn("rounded-3xl border border-border bg-card p-8", cardShadow)}>
            <h3 className="font-display text-xl font-bold">{t("landing.others.ideasTitle")}</h3>
            <ul className="mt-6 space-y-4 text-muted-foreground">
              {[1, 2, 3, 4, 5].map((n) => (
                <li key={n} className="flex items-start gap-3">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" />
                  {t(`landing.others.idea${n}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------- CTA ----------------------------------- */

function FinalCta({
  audience,
  demoHref,
  ideaHref,
  onSwitch,
}: {
  audience: Audience;
  demoHref: string;
  ideaHref: string;
  onSwitch: () => void;
}) {
  const { t } = useTranslation();
  const k = `landing.cta.${audience}`;

  const primary =
    audience === "coaches" ? (
      <a href={demoHref}>{t(`${k}.primary`)}</a>
    ) : audience === "players" ? (
      <Link to="/auth">{t(`${k}.primary`)}</Link>
    ) : (
      <a href={ideaHref}>{t(`${k}.primary`)}</a>
    );

  return (
    <section className="bg-background">
      <div className="mx-auto max-w-[1170px] px-5 py-16 lg:px-6 lg:py-20">
        <div
          className={cn(
            "rounded-3xl border border-border bg-card p-8 text-center sm:p-10 md:p-16",
            cardShadow,
          )}
        >
          <h2 className="mx-auto max-w-2xl text-3xl font-bold leading-tight md:text-[40px]">
            {t(`${k}.title`)}
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-lg leading-relaxed text-muted-foreground">
            {t(`${k}.body`)}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="h-[52px] px-8 text-[15px]">
              {primary}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="h-[52px] bg-card px-8 text-[15px]"
              onClick={onSwitch}
            >
              {t(`${k}.switch`)}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="bg-background">
      <div className="mx-auto flex max-w-[1170px] flex-col gap-5 border-t border-border px-5 py-8 sm:flex-row sm:items-center sm:justify-between lg:px-6">
        <BrandLockup markSize={26} textClass="text-base" />
        <nav className="flex gap-6 text-sm text-muted-foreground">
          <Link to="/support" className="hover:text-foreground">
            {t("landing.footer.contact")}
          </Link>
          <Link to="/privacy" className="hover:text-foreground">
            {t("landing.footer.privacy")}
          </Link>
          <Link to="/terms" className="hover:text-foreground">
            {t("landing.footer.terms")}
          </Link>
        </nav>
      </div>
    </footer>
  );
}

/* ----------------------------------- page ---------------------------------- */

/**
 * Where the final CTA's secondary button goes. Follows the button's *label*
 * ("Sou aluno" -> players, "Sou treinador" -> coaches, "Ver para treinadores"
 * -> coaches), not the Lovable original's blind rotation, which sent "Sou
 * treinador" to the "others" audience.
 */
const NEXT_AUDIENCE: Record<Audience, Audience> = {
  coaches: "players",
  players: "coaches",
  others: "coaches",
};

const LandingPage = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [audience, setAudience] = useState<Audience>(() =>
    readAudience(searchParams.get("audience")),
  );

  const demoHref = mailto(SUPPORT_CONTACT_EMAIL, t("landing.mail.demoSubject"));
  const ideaHref = mailto(ADMIN_CONTACT_EMAIL, t("landing.mail.ideaSubject"));

  return (
    <div className="min-h-screen bg-card">
      <Header demoHref={demoHref} />
      <main>
        <section className="bg-card">
          <div className="mx-auto max-w-[1170px] px-5 pt-8 lg:px-6 lg:pt-10">
            <AudienceTabs value={audience} onChange={setAudience} />
          </div>
          <Hero audience={audience} demoHref={demoHref} ideaHref={ideaHref} />
        </section>
        {audience === "others" ? (
          <OthersContent ideaHref={ideaHref} onShowCoaches={() => setAudience("coaches")} />
        ) : (
          <>
            <Benefits audience={audience} />
            <HowItWorks audience={audience} demoHref={demoHref} />
            <Results audience={audience} />
          </>
        )}
        <FinalCta
          audience={audience}
          demoHref={demoHref}
          ideaHref={ideaHref}
          onSwitch={() => setAudience(NEXT_AUDIENCE[audience])}
        />
      </main>
      <Footer />
    </div>
  );
};

export default LandingPage;
