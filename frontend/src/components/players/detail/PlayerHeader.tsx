import { useState } from "react";
import type { CoachPlayer, CoachLevel } from "@/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Copy, Pencil, UserX } from "lucide-react";

interface PlayerHeaderProps {
  player: CoachPlayer;
  levels: CoachLevel[];
  onEdit: () => void;
}

export function PlayerHeader({ player, levels, onEdit }: PlayerHeaderProps) {
  const [copied, setCopied] = useState(false);

  const initials = (player.name || "")
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const level = player.level ?? levels.find((l) => l.id === player.levelId);
  const inviteLink = `${window.location.origin}/register/${player.userId || "player"}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
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

      {!player.isActive && (
        <div className="rounded-lg border border-dashed border-warning bg-warning/5 p-4 space-y-3">
          <div className="flex gap-2">
            <UserX className="h-4 w-4 text-warning mt-0.5" />
            <div>
              <p className="text-sm font-medium">This player doesn’t have an account</p>
              <p className="text-sm text-muted-foreground">
                Share this link so they can register.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Input readOnly value={inviteLink} className="text-xs" />
            <Button variant="outline" size="icon" onClick={handleCopy}>
              {copied ? (
                <Check className="h-4 w-4 text-primary" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
