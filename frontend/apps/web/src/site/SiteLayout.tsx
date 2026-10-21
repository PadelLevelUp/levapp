/**
 * The new public site's chrome (PAD-656, auth.landing-page): header, main and footer, from the FINAL
 * Claude design. One responsive page per audience (the switcher swaps the body without a reload;
 * the audience is `?para=` in the URL, rule 4). Not mounted until the switch commit; the current
 * LandingPage serves `/` until then.
 *
 * Breakpoints (the design's): ≥ 993 px the desktop header; 993–1100 px tighter link spacing;
 * ≤ 992 px the links and the two buttons move into the ☰ menu; ≤ 640 px no wordmark; ≤ 380 px a
 * compact switcher. Nothing here may scroll the page sideways.
 */
import { Check, ChevronDown, Menu, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { ExitLink } from "@/components/landing/ExitLink";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { AUDIENCES, type Audience } from "./audience";

/** The section anchors the header links point at; every audience page uses the same ids. */
export const SITE_SECTIONS = { benefits: "vantagens", how: "como-funciona", results: "resultados" } as const;

/** Primary, outline and small buttons as the design draws them (56 px; 44 px small). */
export const siteButton = {
  primary:
    "inline-flex min-h-[56px] items-center justify-center gap-2 rounded-xl bg-site-primary px-6 text-[17px] font-medium text-white transition-colors hover:bg-site-primary-hover focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-site-primary/35",
  outline:
    "inline-flex min-h-[56px] items-center justify-center gap-2 rounded-xl border border-site-border-strong bg-white px-6 text-[17px] font-medium text-site-ink transition-colors hover:bg-site-surface focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-site-primary/35",
  small: "min-h-[44px] rounded-[10px] px-4 text-[15px]",
} as const;

export function SiteWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display font-bold tracking-[-0.02em] text-site-ink", className)}>
      Lev<span className="text-site-primary">App</span>
    </span>
  );
}

function Lockup({ size, wordClass, hideWordOnPhone }: { size: number; wordClass: string; hideWordOnPhone?: boolean }) {
  const { t } = useTranslation();
  return (
    <a href="#topo" className="flex shrink-0 items-center gap-2.5" aria-label={hideWordOnPhone ? t("site.layout.home") : undefined}>
      <img src="/brand/levapp-icon.svg" alt="" aria-hidden="true" width={size} height={size} className="rounded-[23%]" style={{ width: size, height: size }} />
      <SiteWordmark className={cn(wordClass, hideWordOnPhone && "max-[640px]:hidden")} />
    </a>
  );
}

/** The audience pill: "Para treinadores ▾ / Para alunos / Outros", ✓ on the current one. */
function AudienceSwitch({ value, onChange }: { value: Audience; onChange: (next: Audience) => void }) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="site-audience"
          data-audience={value}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-site-wash pl-4 pr-3 text-[14px] font-semibold text-site-primary transition-colors hover:bg-site-wash-hover max-[380px]:pl-3 max-[380px]:pr-2.5 max-[380px]:text-[13px]"
        >
          <span className="sr-only">{t("site.layout.audienceLabel")}: </span>
          {t(`site.layout.audience.${value}`)}
          <ChevronDown className="h-4 w-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[230px] rounded-2xl p-1.5">
        {AUDIENCES.map((id) => (
          <DropdownMenuItem
            key={id}
            data-testid={`site-audience-${id}`}
            aria-current={id === value ? "true" : undefined}
            onSelect={() => onChange(id)}
            className="flex min-h-[44px] items-center justify-between gap-3 rounded-[10px] text-[15px] font-semibold"
          >
            {t(`site.layout.audience.${id}`)}
            {id === value && <Check className="h-4 w-4 text-site-primary" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Header({ audience, onAudienceChange, onDemo }: { audience: Audience; onAudienceChange: (next: Audience) => void; onDemo: () => void }) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  // The design hides the section links on "Outros" (it has none of those sections).
  const links =
    audience === "others"
      ? []
      : [
          { id: SITE_SECTIONS.benefits, label: t("site.layout.nav.benefits") },
          { id: SITE_SECTIONS.how, label: t("site.layout.nav.how") },
          { id: SITE_SECTIONS.results, label: t("site.layout.nav.results") },
        ];
  const choose = (next: Audience) => {
    setMenuOpen(false);
    onAudienceChange(next);
  };
  return (
    <header className="sticky top-0 z-50 border-b border-site-border bg-white/95">
      <div className="mx-auto flex h-[76px] max-w-[1240px] items-center gap-5 px-6 min-[993px]:max-[1100px]:gap-3 max-[380px]:gap-2.5">
        <Lockup size={34} wordClass="text-[26px]" hideWordOnPhone />
        <AudienceSwitch value={audience} onChange={choose} />
        <nav aria-label={t("site.layout.nav.label")} className="hidden items-center min-[993px]:flex" data-testid="site-nav">
          {links.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              className="rounded-[10px] px-3 py-2.5 text-[17px] text-site-muted transition-colors hover:bg-site-surface hover:text-site-ink min-[993px]:max-[1100px]:px-2"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <div className="min-w-0 flex-1" />
        <div className="hidden items-center gap-3 min-[993px]:flex">
          <ExitLink to="/auth" className={cn(siteButton.outline, siteButton.small)} data-testid="site-login">
            {t("site.layout.login")}
          </ExitLink>
          <button type="button" onClick={onDemo} className={cn(siteButton.primary, siteButton.small)} data-testid="site-demo">
            {t("site.layout.demo")}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="site-menu"
          aria-label={menuOpen ? t("site.layout.closeMenu") : t("site.layout.openMenu")}
          data-testid="site-burger"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-site-border-strong text-site-ink min-[993px]:hidden"
        >
          {menuOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
        </button>
      </div>
      {menuOpen && (
        <nav id="site-menu" aria-label={t("site.layout.nav.label")} data-testid="site-menu" className="border-t border-site-border bg-white px-6 pb-4 pt-2 min-[993px]:hidden">
          {links.map((link) => (
            <a key={link.id} href={`#${link.id}`} onClick={() => setMenuOpen(false)} className="flex min-h-[44px] items-center px-3 text-[16px] font-semibold text-site-ink">
              {link.label}
            </a>
          ))}
          <div className="mt-2 flex gap-3">
            <ExitLink to="/auth" className={cn(siteButton.outline, siteButton.small, "flex-1")}>
              {t("site.layout.login")}
            </ExitLink>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onDemo();
              }}
              className={cn(siteButton.primary, siteButton.small, "flex-1 whitespace-nowrap")}
            >
              {t("site.layout.demo")}
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}

function Footer({ onCookiePreferences }: { onCookiePreferences: () => void }) {
  const { t } = useTranslation();
  const link = "text-[16px] text-site-muted transition-colors hover:text-site-ink";
  return (
    <footer className="bg-site-grey pb-10">
      <div className="mx-auto max-w-[1240px] px-6">
        <div className="flex flex-col gap-5 border-t border-site-border-strong pt-10 sm:flex-row sm:items-center sm:justify-between">
          <Lockup size={28} wordClass="text-[20px]" />
          <nav aria-label={t("site.footer.label")} className="flex flex-wrap gap-x-7 gap-y-2" data-testid="site-footer">
            <Link to="/contacto" className={link} data-testid="site-footer-contact">
              {t("site.footer.contact")}
            </Link>
            <ExitLink to="/privacy" className={link} data-testid="site-footer-privacy">
              {t("site.footer.privacy")}
            </ExitLink>
            <ExitLink to="/terms" className={link} data-testid="site-footer-terms">
              {t("site.footer.terms")}
            </ExitLink>
            <button type="button" onClick={onCookiePreferences} className={link} data-testid="cookie-preferences">
              {t("site.footer.cookies")}
            </button>
          </nav>
        </div>
      </div>
    </footer>
  );
}

/**
 * The site chrome around an audience page. `onDemo` opens the demo dialog (B's form component);
 * `consent` is the cookie banner slot and `onCookiePreferences` reopens it (B's useSiteConsent).
 */
export function SiteLayout({
  audience,
  onAudienceChange,
  onDemo,
  onCookiePreferences,
  consent,
  overlays,
  children,
}: {
  audience: Audience;
  onAudienceChange: (next: Audience) => void;
  onDemo: () => void;
  onCookiePreferences: () => void;
  /** B: consent banner. */
  consent?: ReactNode;
  /** The demo dialog and anything else drawn over the page. */
  overlays?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="lv-site min-h-screen overflow-x-clip bg-white font-sans text-site-ink" data-testid="site">
      <Header audience={audience} onAudienceChange={onAudienceChange} onDemo={onDemo} />
      <main id="topo">{children}</main>
      <Footer onCookiePreferences={onCookiePreferences} />
      {consent}
      {overlays}
    </div>
  );
}
