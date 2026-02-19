import type { CoachPlayer, CoachLevel } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Phone, User } from "lucide-react";

interface PlayerInfoCardProps {
  player: CoachPlayer;
  levels: CoachLevel[];
}

export function PlayerInfoCard({ player, levels }: PlayerInfoCardProps) {
  const level = player.level ?? levels.find((l) => l.id === player.levelId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Info</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <span>{player.username || "No username"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span>{player.email || "No email"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-muted-foreground" />
          <span>{player.phone || "No phone"}</span>
        </div>

        {player.notes && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p>{player.notes}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
