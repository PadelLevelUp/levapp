/** PAD-656: the "Outros" page (clubs, academies, partners). Filled in by a later commit. */
import { useTranslation } from "react-i18next";

import type { Audience } from "../audience";

export function OthersPage(_props: { onSwitch: (next: Audience) => void }) {
  const { t } = useTranslation();
  return (
    <div data-testid="site-page-others">
      <section className="mx-auto max-w-[1240px] px-6 py-[112px] max-[640px]:py-[72px]">
        <h1 className="font-display text-[clamp(50px,6.6vw,100px)] font-bold leading-none tracking-[-0.03em]">{t("site.others.hero.title")}</h1>
      </section>
    </div>
  );
}
