import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThumbsUp, ThumbsDown } from "lucide-react";

interface PlayerStrengthsWeaknessesProps {
  strengths: string[];
  weaknesses: string[];
}

export function PlayerStrengthsWeaknesses({ strengths, weaknesses }: PlayerStrengthsWeaknessesProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <ThumbsUp className="h-4 w-4 text-green-600" />
            Strengths
          </CardTitle>
        </CardHeader>
        <CardContent>
          {strengths.length === 0 ? (
            <p className="text-sm text-muted-foreground">None recorded.</p>
          ) : (
            <ul className="space-y-2">
              {strengths.map((s, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <ThumbsDown className="h-4 w-4 text-orange-500" />
            Weaknesses
          </CardTitle>
        </CardHeader>
        <CardContent>
          {weaknesses.length === 0 ? (
            <p className="text-sm text-muted-foreground">None recorded.</p>
          ) : (
            <ul className="space-y-2">
              {weaknesses.map((w, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-orange-400 shrink-0" />
                  {w}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
