import type { PlayerEvaluation } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface PlayerEvaluationsProps {
  evaluations: PlayerEvaluation[];
}

export function PlayerEvaluations({ evaluations }: PlayerEvaluationsProps) {
  if (evaluations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Evaluation</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No evaluations yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Evaluation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {evaluations.map((ev) => {
          const pct = Math.round(((ev.score - ev.scaleMin) / (ev.scaleMax - ev.scaleMin)) * 100);
          return (
            <div key={ev.categoryId} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{ev.categoryName}</span>
                <span className="text-muted-foreground">{ev.score} / {ev.scaleMax}</span>
              </div>
              <Progress value={pct} className="h-2" />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}