/**
 * PAD-656: "Para treinadores", the default audience. Sections in the FINAL design's order: hero,
 * Vantagens (three cards, three feature rows, the week calendar), Como funciona (steps, import, the
 * two-phone demo), Resultados (pilot figures, quote, tactical board), the closing call. No Preço
 * section (owner, 2026-10-21). Copy is `site.coaches.*`, pt-PT with "tu".
 */
import { Clock, Swords, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

import { SITE_SECTIONS, siteButton } from "../SiteLayout";
import { CalendarMockup } from "../mockups/CalendarMockup";
import { AttendanceMockup, BookingsMockup, ImportMockup, NewStudentsMockup, NoticesMockup } from "../mockups/coachMockups";
import { CoachHeroMockup, LaptopShot, PhoneShot, SCREENS } from "../mockups/devices";
import { TacticalBoard } from "../mockups/TacticalBoard";
import { TwoPhoneDemo } from "../mockups/TwoPhoneDemo";
import {
  Badge,
  Card,
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
import { useList } from "./useList";
import type { AudiencePageProps } from "./types";

export function CoachesPage({ onDemo, onSwitch }: AudiencePageProps) {
  const { t } = useTranslation();
  const list = useList<string>();
  const steps = useList<{ title: string; body: string }>();
  const stats = useList<{ value: string; label: string }>();
  const c = (k: string) => t(`site.coaches.${k}`);

  return (
    <div data-testid="site-page-coaches">
      {/* ── hero ── */}
      <Section testId="site-coaches-hero">
        <TwoColumns>
          <div className="flex flex-col gap-7">
            <div>
              <Badge>{c("hero.badge")}</Badge>
            </div>
            <Heading level={1} first={c("hero.title")} second={c("hero.titleBlue")} />
            <Lead>{c("hero.lead")}</Lead>
            <div className="flex flex-wrap gap-3">
              <button type="button" className={siteButton.primary} onClick={() => onDemo("demonstracao")} data-testid="site-coaches-hero-demo">
                {c("hero.demo")}
              </button>
              <a href={`#${SITE_SECTIONS.how}`} className={siteButton.outline}>
                {c("hero.how")}
              </a>
            </div>
            <CheckList items={list("site.coaches.hero.checks")} className="grid grid-cols-1 gap-x-6 sm:grid-cols-2" testId="site-coaches-hero-checks" />
            <StoreBadges placement="hero" />
          </div>
          <div role="img" aria-label={c("alt.hero")}>
            <CoachHeroMockup />
          </div>
        </TwoColumns>
      </Section>

      {/* ── Vantagens ── */}
      <Section id={SITE_SECTIONS.benefits} tone="grey" testId="site-coaches-benefits">
        <div className="mb-12 flex max-w-[860px] flex-col gap-4">
          <Eyebrow>{c("benefits.eyebrow")}</Eyebrow>
          <Heading level={2} first={c("benefits.title")} second={c("benefits.titleBlue")} />
        </div>
        <TwoColumns className="items-start">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card className="md:col-span-2">
              <div className="flex flex-wrap gap-8 [&>*]:min-w-0 [&>*]:flex-[1_1_260px]">
                <div className="flex flex-col gap-5">
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-site-wash text-site-primary" aria-hidden>
                    <Clock className="h-6 w-6" />
                  </span>
                  <h3 className="font-display text-[24px] font-bold leading-tight tracking-[-0.02em]">{c("benefits.wide.title")}</h3>
                  <p className="text-[17px] leading-[1.65] text-site-muted">{c("benefits.wide.body")}</p>
                  <CheckList items={list("site.coaches.benefits.wide.checks")} />
                </div>
                <AttendanceMockup />
              </div>
            </Card>
            <FeatureCard icon={<Users className="h-6 w-6" />} title={c("benefits.full.title")} body={c("benefits.full.body")} checks={list("site.coaches.benefits.full.checks")} />
            <FeatureCard icon={<Swords className="h-6 w-6" />} title={c("benefits.level.title")} body={c("benefits.level.body")} checks={list("site.coaches.benefits.level.checks")} />
          </div>
          <div role="img" aria-label={c("alt.benefits")} className="relative mx-auto w-full max-w-[560px] pt-20 max-[900px]:pt-0">
            <LaptopShot src={SCREENS.messages} alt="" />
            <PhoneShot src={SCREENS.mobileMessages} alt="" className="absolute -bottom-6 right-0 hidden w-[130px] sm:block" />
          </div>
        </TwoColumns>

        <FeatureRow eyebrow={c("notices.eyebrow")} title={c("notices.title")} body={c("notices.body")} checks={list("site.coaches.notices.checks")} mockup={<NoticesMockup />} testId="site-coaches-notices" />
        <FeatureRow reverse eyebrow={c("newStudents.eyebrow")} title={c("newStudents.title")} body={c("newStudents.body")} checks={list("site.coaches.newStudents.checks")} mockup={<NewStudentsMockup />} testId="site-coaches-new-students" />
        <FeatureRow eyebrow={c("bookings.eyebrow")} title={c("bookings.title")} body={c("bookings.body")} checks={list("site.coaches.bookings.checks")} mockup={<BookingsMockup />} testId="site-coaches-bookings" />

        <div className="pt-24 max-[640px]:pt-16">
          <CalendarMockup />
        </div>
      </Section>

      {/* ── Como funciona ── */}
      <Section id={SITE_SECTIONS.how} testId="site-coaches-how">
        <TwoColumns>
          <div role="img" aria-label={c("alt.how")} className="relative mx-auto w-full max-w-[620px]">
            <LaptopShot src={SCREENS.presences} alt="" />
            <PhoneShot src={SCREENS.mobilePresencesCoach} alt="" className="absolute -bottom-6 -right-2 hidden w-[130px] sm:block" />
          </div>
          <div className="flex flex-col gap-7">
            <Eyebrow>{c("how.eyebrow")}</Eyebrow>
            <Heading level={2} first={c("how.title")} />
            <Lead>{c("how.lead")}</Lead>
            <NumberedSteps steps={steps("site.coaches.how.steps")} testId="site-coaches-steps" />
            <div>
              <button type="button" className={siteButton.outline} onClick={() => onDemo(null)} data-testid="site-coaches-talk">
                {c("how.talk")} <span aria-hidden>→</span>
              </button>
            </div>
          </div>
        </TwoColumns>
        <FeatureRow reverse eyebrow={c("import.eyebrow")} title={c("import.title")} body={c("import.body")} checks={list("site.coaches.import.checks")} mockup={<ImportMockup />} testId="site-coaches-import" />
        <div className="pt-24 max-[640px]:pt-16">
          <TwoPhoneDemo />
        </div>
      </Section>

      {/* ── Resultados ── */}
      <Section id={SITE_SECTIONS.results} tone="navy" testId="site-coaches-results">
        <TwoColumns className="items-start">
          <div className="flex flex-col gap-8">
            <Eyebrow onNavy>{c("results.eyebrow")}</Eyebrow>
            <Heading level={2} first={c("results.title")} onNavy />
            <Stats items={stats("site.coaches.results.stats")} testId="site-coaches-stats" />
            <p className="text-[14px] text-[#8FA8CC]">{c("results.note")}</p>
            <Quote text={c("results.quote")} initials="BT" name={c("results.quoteName")} role={c("results.quoteRole")} />
          </div>
          <TacticalBoard />
        </TwoColumns>
      </Section>

      {/* ── closing call ── */}
      <ClosingCta
        testId="site-coaches-cta"
        title={c("cta.title")}
        body={c("cta.body")}
        actions={
          <>
            <button type="button" className={siteButton.primary} onClick={() => onDemo("demonstracao")} data-testid="site-coaches-cta-demo">
              {c("cta.demo")}
            </button>
            <button type="button" className={siteButton.outline} onClick={() => onSwitch("players")} data-testid="site-cta-switch">
              {c("cta.player")}
            </button>
          </>
        }
      />
    </div>
  );
}
