import type { CoachPlayer, CoachLevel } from "@/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

interface PlayerHeaderProps {
  player: CoachPlayer;
  levels: CoachLevel[];
  onEdit: () => void;
}

export function PlayerHeader({ player, levels, onEdit }: PlayerHeaderProps) {
  const initials = (player.name || "")
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const level = player.level ?? levels.find((l) => l.id === player.levelId);

  return (
    <div className="flex items-center gap-4">
      <Avatar className="h-16 w-16">
        <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <h1 className="text-2xl font-bold truncate">{player.name || "Unnamed"}</h1>
        <div className="flex flex-wrap gap-2 mt-1">
          {level && <Badge variant="outline">{level.code} — {level.label}</Badge>}
          {player.side && (
            <Badge variant="secondary">
              {player.side === "left" ? "Left" : "Right"}
            </Badge>
          )}
          {!player.isActive && <Badge variant="destructive">Inactive</Badge>}
        </div>
      </div>

      <Button variant="outline" size="sm" onClick={onEdit}>
        <Pencil className="mr-2 h-4 w-4" /> Edit
      </Button>
    </div>
  );
}
