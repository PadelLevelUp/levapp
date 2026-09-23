import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { DashboardEvaluationsBlock } from "@levelup/types";
import { EvaluationCard } from "../evaluations/EvaluationCard";
import { Eyebrow } from "./coach/primitives";

interface StudentEvaluationsBlockProps {
  block: DashboardEvaluationsBlock;
}

/**
 * "Avaliações" (`evaluations.student-view` rules 4-6, PAD-402): up to 3 of the
 * player's newest shared cards, and the way to the full list (`data.href`,
 * `/evaluations`). The server already omits the block entirely when the player
 * has no shared card and caps it at 3 (rules 4-5) — this component never
 * decides either; `StudentDashboard` renders it only when the block is present
 * (`pick(blocks, "evaluations")`), and the slice below is a defensive mirror of
 * the server's own cap, not a second source of truth. Each card is the SAME
 * `EvaluationCard` the coach's preview uses (rule 6), so the two can't disagree.
 */
export function StudentEvaluationsBlock({ block }: StudentEvaluationsBlockProps) {
  const { t } = useTranslation();
  const { cards, href } = block.data;

  return (
    <section className="flex flex-col gap-2.5" data-testid="student-evaluations-block">
      <div className="flex items-center justify-between px-1">
        <Eyebrow>{t("players.evaluationSharing.student.blockTitle")}</Eyebrow>
        <Link
          to={href}
          className="text-xs font-semibold text-primary hover:underline"
          data-testid="student-evaluations-see-all"
        >
          {t("players.evaluationSharing.student.seeAll")}
        </Link>
      </div>
      <div className="flex flex-col gap-2.5">
        {cards.slice(0, 3).map((card) => (
          <EvaluationCard key={card.recordId} card={card} />
        ))}
      </div>
    </section>
  );
}
