/**
 * PAD-656: "Outros" (clubs, academies, partners): the FINAL design's light-hearted "em construção"
 * page with a list of ideas and "Tens uma ideia?". No section links in the header, no closing call.
 * "Enviar ideia" writes to the site's one contact address (rule 14; the design's admin@levapp.pt is
 * CONTACT_EMAIL); "Ver para treinadores" switches the audience.
 */
import { Construction, Lightbulb } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CONTACT_EMAIL } from "@levelup/config";

import type { Audience } from "../audience";
import { siteButton } from "../SiteLayout";
import { Badge, Card, CheckList, Eyebrow, Heading, Lead, Section, TwoColumns } from "../sections/primitives";
import { useList } from "./useList";

export function OthersPage({ onSwitch }: { onSwitch: (next: Audience) => void }) {
  const { t } = useTranslation();
  const list = useList<string>();
  const o = (k: string) => t(`site.others.${k}`);
  const ideaHref = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(o("hero.mailSubject"))}`;
  const mail = (
    <a href={ideaHref} className="font-semibold text-site-primary underline underline-offset-2">
      {CONTACT_EMAIL}
    </a>
  );
  const actions = (testId: string) => (
    <div className="flex flex-wrap gap-3">
      <a href={ideaHref} className={siteButton.primary} data-testid={`${testId}-idea`}>
        {o("hero.idea")}
      </a>
      <button type="button" className={siteButton.outline} onClick={() => onSwitch("coaches")} data-testid={`${testId}-coaches`}>
        {o("hero.coaches")}
      </button>
    </div>
  );

  return (
    <div data-testid="site-page-others">
      <Section testId="site-others-hero">
        <TwoColumns>
          <div className="flex flex-col gap-7">
            <div>
              <Badge>{o("hero.badge")}</Badge>
            </div>
            <Heading level={1} first={o("hero.title")} second={o("hero.titleBlue")} />
            <Lead>
              {o("hero.lead")} {mail}.
            </Lead>
            {actions("site-others-hero")}
            <CheckList items={list("site.others.hero.checks")} />
          </div>
          <Card className="flex flex-col items-start gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-site-wash text-site-primary" aria-hidden>
              <Construction className="h-6 w-6" />
            </span>
            <h2 className="font-display text-[24px] font-bold text-site-ink">{o("hero.cardTitle")}</h2>
            <p className="text-[17px] leading-[1.65] text-site-muted">{o("hero.cardBody")}</p>
          </Card>
        </TwoColumns>
      </Section>

      <Section tone="grey" testId="site-others-ideas">
        <TwoColumns className="items-start">
          <div className="flex flex-col gap-6">
            <Eyebrow>{o("ideas.eyebrow")}</Eyebrow>
            <Heading level={2} first={o("ideas.title")} />
            <Lead>
              {o("ideas.lead")} {mail}.
            </Lead>
            {actions("site-others-ideas")}
          </div>
          <Card testId="site-others-ideas-list">
            <h3 className="mb-4 flex items-center gap-2 font-display text-[20px] font-bold text-site-ink">
              <Lightbulb className="h-5 w-5 text-site-primary" aria-hidden />
              {o("ideas.listTitle")}
            </h3>
            <CheckList items={list("site.others.ideas.list")} />
          </Card>
        </TwoColumns>
      </Section>

      <Section tone="grey" testId="site-others-contact" className="pt-0">
        <div className="flex max-w-[760px] flex-col gap-5">
          <Heading level={2} first={o("contact.title")} />
          <Lead>
            {o("contact.body")} {mail}. {o("contact.bodyAfter")}
          </Lead>
          <div>
            <a href={ideaHref} className={siteButton.primary} data-testid="site-others-contact-idea">
              {o("hero.idea")}
            </a>
          </div>
        </div>
      </Section>
    </div>
  );
}
