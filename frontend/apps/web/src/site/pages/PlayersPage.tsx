/**
 * PAD-656: "Para alunos". Sections in the FINAL design's order: hero (with "Recebi um convite"
 * opening the coach-link explanation in place), O que ganhas (four cards, the coach's chat, the
 * availability row), Como funciona (three steps), Resultados, "Grátis para alunos" (store links;
 * no prices), the closing call. Its own call to action, never the coaches' one.
 */
import { ChevronDown, Swords, Timer, Users, Zap } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { ExitLink } from "@/components/landing/ExitLink";
import { cn } from "@/lib/utils";

import { SITE_SECTIONS, siteButton } from "../SiteLayout";
import { PhoneShot, PlayerHeroMockup, SCREENS } from "../mockups/devices";
import { AvailabilityMockup, PlayerChatMockup } from "../mockups/playerMockups";
import {
  Badge,
  CheckList,
  ClosingCta,
  Eyebrow,
  FeatureCard,
  FeatureRow,
  Heading,
  Lead,
  NumberedSteps,
  Quote,
  Section,
  Stats,
  StoreBadges,
  TwoColumns,
} from "../sections/primitives";
import type { AudiencePageProps } from "./types";
import { useList } from "./useList";

type BenefitCard = { title: string; body: string; checks: string[] };
const CARD_ICONS = [Zap, Users, Timer, Swords];

export function PlayersPage({ onDemo, onSwitch }: AudiencePageProps) {
  const { t } = useTranslation();
  const list = useList<string>();
  const cards = useList<BenefitCard>()("site.players.benefits.cards");
  const steps = useList<{ title: string; body: string }>();
  const stats = useList<{ value: string; label: string }>();
  const p = (k: string) => t(`site.players.${k}`);
  const [inviteOpen, setInviteOpen] = useState(false);
  const panelId = useId();

  return (
    <div data-testid="site-page-players">
      {/* ── hero ── */}
      <Section testId="site-players-hero">
        <TwoColumns>
          <div className="flex flex-col gap-7">
            <div>
              <Badge>{p("hero.badge")}</Badge>
            </div>
            <Heading level={1} first={p("hero.title")} second={p("hero.titleBlue")} />
            <Lead>{p("hero.lead")}</Lead>
            <div className="flex flex-wrap gap-3">
              <ExitLink to="/signup" className={siteButton.primary} data-testid="site-players-signup">
                {p("hero.signup")}
              </ExitLink>
              <button
                type="button"
                className={siteButton.outline}
                aria-expanded={inviteOpen}
                aria-controls={panelId}
                onClick={() => setInviteOpen((open) => !open)}
                data-testid="site-players-invite"
              >
                {p("hero.invite")}
                <ChevronDown className={cn("h-4 w-4 transition-transform", inviteOpen && "rotate-180")} aria-hidden />
              </button>
            </div>
            {inviteOpen && (
              <div id={panelId} data-testid="site-players-invite-panel" className="rounded-2xl border border-site-border bg-site-wash/60 p-5 text-[16px] leading-[1.6]">
                <p className="font-semibold text-site-ink">{p("hero.inviteTitle")}</p>
                <p className="text-site-muted">
                  {p("hero.inviteBody")}{" "}
                  <ExitLink to="/signup" className="font-semibold text-site-primary underline underline-offset-2" data-testid="site-players-invite-signup">
                    {p("hero.inviteSignup")}
                  </ExitLink>{" "}
                  {p("hero.inviteAfter")}
                </p>
              </div>
            )}
            <CheckList items={list("site.players.hero.checks")} className="grid grid-cols-1 gap-x-6 sm:grid-cols-2" />
            <StoreBadges placement="hero" />
          </div>
          <div role="img" aria-label={p("alt.hero")}>
            <PlayerHeroMockup />
          </div>
        </TwoColumns>
      </Section>

      {/* ── O que ganhas ── */}
      <Section id={SITE_SECTIONS.benefits} tone="grey" testId="site-players-benefits">
        <div className="mb-12 flex max-w-[860px] flex-col gap-4">
          <Eyebrow>{p("benefits.eyebrow")}</Eyebrow>
          <Heading level={2} first={p("benefits.title")} />
        </div>
        <TwoColumns className="items-start">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {cards.map((card, i) => {
              const Icon = CARD_ICONS[i] ?? Zap;
              return <FeatureCard key={card.title} icon={<Icon className="h-6 w-6" />} title={card.title} body={card.body} checks={card.checks} />;
            })}
          </div>
          <div className="flex justify-center">
            <PlayerChatMockup />
          </div>
        </TwoColumns>
        <FeatureRow
          eyebrow={p("availability.eyebrow")}
          title={p("availability.title")}
          body={p("availability.body")}
          checks={list("site.players.availability.checks")}
          mockup={<AvailabilityMockup />}
          testId="site-players-availability"
        />
      </Section>

      {/* ── Como funciona ── */}
      <Section id={SITE_SECTIONS.how} testId="site-players-how">
        <TwoColumns>
          <div className="flex justify-center">
            <PhoneShot src={SCREENS.mobileDashboard} alt={p("how.alt")} className="w-full max-w-[320px]" />
          </div>
          <div className="flex flex-col gap-7">
            <Eyebrow>{p("how.eyebrow")}</Eyebrow>
            <Heading level={2} first={p("how.title")} />
            <Lead>{p("how.lead")}</Lead>
            <NumberedSteps steps={steps("site.players.how.steps")} testId="site-players-steps" />
            <div>
              <button type="button" className={siteButton.outline} onClick={() => onDemo(null)} data-testid="site-players-talk">
                {p("how.talk")} <span aria-hidden>→</span>
              </button>
            </div>
          </div>
        </TwoColumns>
      </Section>

      {/* ── Resultados ── */}
      <Section id={SITE_SECTIONS.results} tone="navy" testId="site-players-results">
        <TwoColumns className="items-start">
          <div className="flex flex-col gap-8">
            <Eyebrow onNavy>{p("results.eyebrow")}</Eyebrow>
            <Heading level={2} first={p("results.title")} onNavy />
            <Stats items={stats("site.players.results.stats")} testId="site-players-stats" />
            <Lead onNavy>{p("results.body")}</Lead>
            <Quote text={p("results.quote")} initials="PP" name={p("results.quoteName")} role={p("results.quoteRole")} />
          </div>
          <div className="flex justify-center">
            <PhoneShot src={SCREENS.mobilePresences} alt={p("results.alt")} className="w-full max-w-[300px]" />
          </div>
        </TwoColumns>
      </Section>

      {/* ── Grátis para alunos (availability, no prices) ── */}
      <Section testId="site-players-free">
        <div className="flex max-w-[760px] flex-col gap-6">
          <Heading level={2} first={p("free.title")} />
          <Lead>{p("free.lead")}</Lead>
          <CheckList items={list("site.players.free.points")} />
          <StoreBadges placement="free" />
        </div>
      </Section>

      {/* ── closing call ── */}
      <ClosingCta
        testId="site-players-cta"
        title={p("cta.title")}
        body={p("cta.body")}
        actions={
          <>
            <ExitLink to="/signup" className={siteButton.primary} data-testid="site-players-cta-signup">
              {p("cta.signup")}
            </ExitLink>
            <button type="button" className={siteButton.outline} onClick={() => onSwitch("coaches")} data-testid="site-cta-switch">
              {p("cta.coach")}
            </button>
          </>
        }
      />
    </div>
  );
}
