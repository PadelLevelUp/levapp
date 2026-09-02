/**
 * The public page — what a visitor sees at `/` with no session.
 *
 * Web-only, and deliberately so — the "web and iOS ship together" rule in
 * CLAUDE.md wants that reason written down. It was scoped to the web app when
 * it was asked for ("for the webapp only"), and it is also the shape of surface
 * that carve-out is for: a logged-out page for academy owners choosing
 * software, where the iOS equivalent is the App Store listing. Note the loader
 * this page hands off to is NOT web-only — iOS has had the same animation on
 * cold start since the launch-animation work, so it brings web up to parity.
 * (specs/ is not under git, so this comment is the durable home for the reason.)
 *
 * Built from `reference/design/LevApp Landing Page.dc.html`, which ships two
 * artboards (desktop 1440, mobile 390). This is one responsive page rather
 * than two, so the breakpoints below are where the desktop artboard has to
 * become the mobile one, not arbitrary choices.
 *
 * Colours come from the app's tokens (`bg-card`, `text-muted-foreground`, …)
 * and not from the reference's hexes, so the page follows the theme like every
 * other screen. Two blocks are the exception and are painted with the brand
 * navy directly — the "next class" tile in the preview and the players strip.
 * Those are navy *in the brand*, the same way the loader background is; making
 * them token-driven would turn them white in light mode and lose the block.
 *
 * Three CTAs in the design had no destination in the product. The decisions,
 * so the next person doesn't have to re-derive them:
 *   - "Pedir demonstração" -> mailto the support address. There is no
 *     demo-request endpoint, and inventing a form here would mean a backend
 *     change this page doesn't need.
 *   - "Ver como funciona" / the nav links -> in-page anchors. There are no
 *     separate marketing pages to link to yet.
 *   - "Recebi um convite" -> /support. Invitations are tokenised links
 *     (`/invite/player/:token`) sent by message, so there is no tokenless
 *     entry point to send someone to; a player holding a dead or missing
 *     invite needs a human, which is what /support is for.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The brand navy, as a gradient. Matches the loader and the app's chrome. */
const NAVY = "linear-gradient(150deg, #16294A 0%, #0B1524 100%)";

const SUPPORT_CONTACT_EMAIL = "padellevelup2026@gmail.com";

const SECTION_HOW = "como-funciona";
const SECTION_ACADEMIES = "para-academias";
const SECTION_PLAYERS = "para-jogadores";

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
    <div className="flex items-center gap-2.5">
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
    </div>
  );
}

/**
 * The dashboard, as a still. Deliberately hand-built rather than a screenshot:
 * a screenshot goes stale the first time the real dashboard changes, and it
 * would need one per language and per theme.
 */
function ProductPreview() {
  const { t } = useTranslation();

  return (
    <div className="flex w-full max-w-[420px] flex-col gap-3 rounded-[2rem] border border-border bg-muted p-5 shadow-[0_24px_48px_-24px_rgba(13,27,49,0.35)]">
      <div className="flex items-end justify-between px-1 pb-1.5 pt-1">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">
            {t("landing.preview.date")}
          </span>
          <span className="font-display text-xl font-bold tracking-tight">
            {t("landing.preview.title")}
          </span>
        </div>
        <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-[#0D1B31] text-xs font-semibold text-white">
          {t("landing.preview.initials")}
        </span>
      </div>

      <div
        className="flex flex-col gap-3 rounded-[1.125rem] p-[18px]"
        style={{ background: NAVY }}
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold tracking-[0.1em] text-[#8FA8CC]">
            {t("landing.preview.nextEyebrow")}
          </span>
          <span className="rounded-full bg-[#4A9BFF]/20 px-2.5 py-1 text-[11px] font-semibold text-[#9CC6FF]">
            {t("landing.preview.nextIn")}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-display text-[22px] font-bold text-white">
            {t("landing.preview.nextClass")}
          </span>
          <span className="text-[13px] text-[#A9BCD6]">
            {t("landing.preview.nextMeta")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-[5px] flex-1 overflow-hidden rounded-full bg-white/30">
            <div className="h-full w-3/4 bg-white" />
          </div>
          <span className="text-xs font-semibold text-white">
            {t("landing.preview.nextCount")}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border border-l-4 border-l-warning bg-card p-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-bold">{t("landing.preview.gapTitle")}</span>
          <span className="text-xs text-muted-foreground">
            {t("landing.preview.gapMeta")}
          </span>
        </div>
        <div className="flex gap-2">
          <span className="grid h-[38px] flex-1 place-items-center rounded-[10px] bg-primary px-2 text-center text-[13px] font-semibold text-primary-foreground">
            {t("landing.preview.gapPrimary")}
          </span>
          <span className="grid h-[38px] place-items-center rounded-[10px] border border-border px-3.5 text-[13px] font-semibold text-muted-foreground">
            {t("landing.preview.gapSecondary")}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-border border-l-4 border-l-primary bg-card p-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-secondary text-[11px] font-bold text-secondary-foreground">
          {t("landing.preview.replyInitials")}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-bold">
            {t("landing.preview.replyTitle")}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {t("landing.preview.replyBody")}
          </span>
        </div>
      </div>
    </div>
  );
}

function ValueCard({
  visual,
  title,
  body,
}: {
  visual: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col gap-5 rounded-[1.25rem] border border-border bg-card p-6 sm:p-8">
      <div className="flex h-10 items-end gap-1.5">{visual}</div>
      <div className="flex flex-col gap-2">
        <h3 className="font-display text-lg font-semibold sm:text-xl">{title}</h3>
        <p className="text-[15px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

const LandingPage = () => {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = [
    { id: SECTION_HOW, label: t("landing.nav.how") },
    { id: SECTION_ACADEMIES, label: t("landing.nav.academies") },
    { id: SECTION_PLAYERS, label: t("landing.nav.players") },
  ];

  const demoHref = `mailto:${SUPPORT_CONTACT_EMAIL}?subject=${encodeURIComponent(
    t("landing.hero.primary"),
  )}`;

  return (
    <div className="min-h-screen bg-card">
      {/* ── nav ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex h-[68px] max-w-[1440px] items-center gap-6 px-5 sm:h-[76px] lg:gap-10 lg:px-14">
          <BrandLockup markSize={30} textClass="text-lg sm:text-xl" />

          <nav className="hidden items-center gap-7 text-[15px] font-medium text-muted-foreground lg:flex">
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
            <Button asChild className="hidden lg:inline-flex">
              <a href={demoHref}>{t("landing.nav.demo")}</a>
            </Button>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-label={
                menuOpen ? t("landing.nav.closeMenu") : t("landing.nav.openMenu")
              }
              className="grid h-11 w-11 place-items-center rounded-md text-foreground lg:hidden"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="flex flex-col border-t border-border px-5 py-2 lg:hidden">
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

      <main>
        {/* ── hero ──────────────────────────────────────────────────────── */}
        <section className="mx-auto grid max-w-[1440px] items-center gap-12 px-5 pb-11 pt-10 sm:pb-16 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-16 lg:px-14 lg:pb-[84px] lg:pt-[76px]">
          <div className="flex flex-col gap-6 lg:gap-7">
            <span className="self-start rounded-full bg-secondary px-3.5 py-2 text-[13px] font-semibold text-secondary-foreground">
              {t("landing.hero.eyebrow")}
            </span>
            <h1 className="font-display text-[40px] font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-[62px] lg:leading-[1.06]">
              {t("landing.hero.titleLine1")}
              <br className="hidden lg:inline" />{" "}
              {t("landing.hero.titleLine2")}
            </h1>
            <p className="max-w-[520px] text-[17px] leading-relaxed text-muted-foreground lg:text-[19px]">
              {t("landing.hero.subtitle")}
            </p>
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-3">
              <Button asChild size="lg" className="h-[52px] text-[15px]">
                <a href={demoHref}>{t("landing.hero.primary")}</a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-[52px] bg-card text-[15px]"
              >
                <a href={`#${SECTION_HOW}`}>{t("landing.hero.secondary")}</a>
              </Button>
            </div>
          </div>

          <div className="flex justify-center lg:justify-end">
            <ProductPreview />
          </div>
        </section>

        {/* ── what changes ──────────────────────────────────────────────── */}
        <section
          id={SECTION_HOW}
          className="scroll-mt-20 border-t border-border bg-muted"
        >
          <div
            id={SECTION_ACADEMIES}
            className="mx-auto flex max-w-[1440px] scroll-mt-20 flex-col gap-7 px-5 py-12 sm:py-16 lg:gap-10 lg:px-14 lg:py-[72px]"
          >
            <div className="flex max-w-[620px] flex-col gap-3">
              <span className="text-xs font-semibold tracking-[0.1em] text-muted-foreground">
                {t("landing.values.eyebrow")}
              </span>
              <h2 className="font-display text-[30px] font-bold leading-tight tracking-tight lg:text-[38px]">
                {t("landing.values.title")}
              </h2>
            </div>

            <div className="grid gap-3.5 lg:grid-cols-3 lg:gap-6">
              <ValueCard
                title={t("landing.values.full.title")}
                body={t("landing.values.full.body")}
                visual={
                  <>
                    <div className="h-[40%] w-3 rounded-[3px] bg-secondary" />
                    <div className="h-[62%] w-3 rounded-[3px] bg-primary/40" />
                    <div className="h-full w-3 rounded-[3px] bg-primary" />
                  </>
                }
              />
              <ValueCard
                title={t("landing.values.invites.title")}
                body={t("landing.values.invites.body")}
                visual={
                  <div className="flex h-full flex-wrap items-center gap-2">
                    <span className="rounded-full bg-success/15 px-3 py-1.5 text-xs font-semibold text-success-strong">
                      {t("landing.values.invites.accepted")}
                    </span>
                    <span className="rounded-full bg-warning/15 px-3 py-1.5 text-xs font-semibold text-warning-strong">
                      {t("landing.values.invites.pending")}
                    </span>
                  </div>
                }
              />
              <ValueCard
                title={t("landing.values.progress.title")}
                body={t("landing.values.progress.body")}
                visual={
                  <div className="flex h-full items-end gap-1">
                    {[1, 1, 0, 1, 1, 0, 1, 1].map((present, i) => (
                      <span
                        key={i}
                        className={cn(
                          "h-[26px] w-[7px] rounded-sm",
                          present ? "bg-success" : "bg-border",
                        )}
                      />
                    ))}
                  </div>
                }
              />
            </div>
          </div>
        </section>

        {/* ── players ───────────────────────────────────────────────────── */}
        <section id={SECTION_PLAYERS} className="scroll-mt-20" style={{ background: NAVY }}>
          <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-5 py-11 sm:py-14 lg:flex-row lg:items-center lg:gap-14 lg:px-14 lg:py-16">
            <div className="flex flex-1 flex-col gap-3.5">
              <span className="text-xs font-semibold tracking-[0.1em] text-[#8FA8CC]">
                {t("landing.players.eyebrow")}
              </span>
              <h2 className="font-display text-[28px] font-bold leading-tight tracking-tight text-white lg:text-[34px]">
                {t("landing.players.title")}
              </h2>
              <p className="max-w-[520px] text-base leading-relaxed text-[#A9BCD6] lg:text-[17px]">
                {t("landing.players.body")}
              </p>
            </div>
            <div className="flex flex-col gap-2.5 sm:flex-row sm:gap-3">
              <Button
                asChild
                size="lg"
                className="h-[52px] bg-[#2F8AFF] text-[15px] text-white hover:brightness-95"
              >
                <Link to="/auth">{t("landing.players.primary")}</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-[52px] border-[#2E4460] bg-transparent text-[15px] text-[#A9BCD6] hover:bg-white/5 hover:text-white"
              >
                <Link to="/support">{t("landing.players.secondary")}</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* ── footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-5 py-8 sm:flex-row sm:items-center sm:gap-8 lg:px-14 lg:py-10">
          <BrandLockup markSize={26} textClass="text-base" />
          <div className="flex-1" />
          <nav className="flex gap-5 text-sm text-muted-foreground lg:gap-6">
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
    </div>
  );
};

export default LandingPage;
