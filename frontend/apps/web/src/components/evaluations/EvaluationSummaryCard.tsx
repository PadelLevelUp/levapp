import { useTranslation } from "react-i18next";
import { ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEvaluationDate } from "./formatEvaluationDate";

interface EvaluationSummaryCardProps {
  /** `lastEvaluatedOn` from `GET /player/<id>/evaluations`; undefined while it loads. */
  lastEvaluatedOn: string | null | undefined;
  onOpen: () => void;
}

/**
 * The profile card "Avaliação" (evaluations.history rule 2): when the last
 * evaluation was, and the way into "Avaliações". The at-a-glance list of latest
 * scores it replaces is `players/detail/PlayerEvaluations.tsx`, kept unmounted
 * while owner question Q7 is open — see PlayerDetailPage.
 */
export function EvaluationSummaryCard({ lastEvaluatedOn, onOpen }: EvaluationSummaryCardProps) {
  const { t, i18n } = useTranslation();
  return (
    <Card data-testid="evaluation-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg">{t("players.evaluationHistory.cardTitle")}</CardTitle>
        <Button type="button" onClick={onOpen} data-testid="player-evaluations-open">
          <ClipboardList className="mr-2 h-4 w-4" />
          {t("players.evaluationHistory.open")}
        </Button>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground" data-testid="evaluation-card-last">
          {lastEvaluatedOn === undefined
            ? " "
            : lastEvaluatedOn === null
              ? t("players.evaluationHistory.none")
              : t("players.evaluationHistory.lastEvaluated", { date: formatEvaluationDate(lastEvaluatedOn, i18n.language) })}
        </p>
      </CardContent>
    </Card>
  );
}
