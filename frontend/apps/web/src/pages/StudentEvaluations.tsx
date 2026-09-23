import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useMyEvaluations } from "@levelup/hooks";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { EvaluationCard } from "@/components/evaluations/EvaluationCard";

/**
 * "As minhas avaliações" (`evaluations.student-view` rules 2, 3, 7-8, PAD-402):
 * every card ever shared with the caller, newest `sharedAt` first, each naming
 * its own coach — the full list behind the dashboard block's "Ver todas". A
 * player cannot act on a card (rule 7): no rating, reply or delete here, only
 * reading; the one action is opening the conversation with that coach, from
 * the messages surface, not from this page.
 */
export default function StudentEvaluations() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useMyEvaluations();
  const cards = data?.cards ?? [];

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl space-y-6 p-6" data-testid="student-evaluations-page">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => navigate("/dashboard")}
          data-testid="student-evaluations-back"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("common.back")}
        </Button>

        <h1 className="text-2xl font-semibold tracking-tight">
          {t("players.evaluationSharing.student.pageTitle")}
        </h1>

        {isError && (
          <p className="text-sm text-destructive" role="alert" data-testid="student-evaluations-error">
            {t("players.evaluationSharing.student.loadError")}
          </p>
        )}
        {!isLoading && !isError && cards.length === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="student-evaluations-empty">
            {t("players.evaluationSharing.student.empty")}
          </p>
        )}

        <div className="flex flex-col gap-4">
          {cards.map((card) => (
            <EvaluationCard key={card.recordId} card={card} />
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
