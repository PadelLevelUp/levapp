/** PAD-656: the "Coaches" audience page. Sections follow the FINAL design; filled in by the next commits. */
import { useTranslation } from "react-i18next";

import { SITE_SECTIONS } from "../SiteLayout";
import type { AudiencePageProps } from "./types";

export function CoachesPage(_props: AudiencePageProps) {
  const { t } = useTranslation();
  const key = "coaches";
  return (
    <div data-testid={`site-page-${key}`}>
      <section className="mx-auto max-w-[1240px] px-6 py-[112px] max-[640px]:py-[72px]">
        <h1 className="font-display text-[clamp(50px,6.6vw,100px)] font-bold leading-none tracking-[-0.03em]">{t(`site.${key}.hero.title`)}</h1>
      </section>
      <section id={SITE_SECTIONS.benefits} className="scroll-mt-[76px]" />
      <section id={SITE_SECTIONS.how} className="scroll-mt-[76px]" />
      <section id={SITE_SECTIONS.results} className="scroll-mt-[76px]" />
    </div>
  );
}
