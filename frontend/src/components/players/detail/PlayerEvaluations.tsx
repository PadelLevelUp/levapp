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
        {evaluations.map((ev) => (
          <div key={ev.topic} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{ev.topic}</span>
              <span className="text-muted-foreground">{ev.score}%</span>
            </div>
            <Progress value={ev.score} className="h-2" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
