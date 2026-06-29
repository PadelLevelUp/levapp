import { useState } from "react";
import type { CoachPlayer, CoachLevel, PlayerSide } from "@/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Copy, Loader2, Pencil, UserX, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PlayerHeaderProps {
  player: CoachPlayer;
  levels: CoachLevel[];
  isEditing: boolean;
  saving?: boolean;
  draftName: string;
  draftLevelId: string;
  draftSide: PlayerSide | "";
  onDraftNameChange: (v: string) => void;
  onDraftLevelIdChange: (v: string) => void;
  onDraftSideChange: (v: PlayerSide | "") => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}

export function PlayerHeader({
  player,
  levels,
  isEditing,
  saving = false,
  draftName,
  draftLevelId,
  draftSide,
  onDraftNameChange,
  onDraftLevelIdChange,
  onDraftSideChange,
  onEdit,
  onSave,
  onCancel,
}: PlayerHeaderProps) {
  const [copied, setCopied] = useState(false);

  const displayName = isEditing ? draftName : (player.name || "");
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const level = player.level ?? levels.find((l) => l.id === String(player.levelId));
  const inviteLink = `${window.location.origin}/register/${player.userId || "player"}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      {isEditing ? (
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 shrink-0">
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <Input
              value={draftName}
              onChange={(e) => onDraftNameChange(e.target.value)}
              className="flex-1 text-lg font-semibold"
              placeholder="Player name"
            />
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={draftSide} onValueChange={(v) => onDraftSideChange(v as PlayerSide | "")}>
              <SelectTrigger className="h-10 w-full sm:w-32">
                <SelectValue placeholder="Side" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
            <Select value={draftLevelId} onValueChange={onDraftLevelIdChange}>
              <SelectTrigger className="h-10 w-full sm:flex-1">
                <SelectValue placeholder="No Level" />
              </SelectTrigger>
              <SelectContent>
                {levels.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.code} — {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
              <X className="mr-2 h-4 w-4" /> Cancel
            </Button>
            <Button size="sm" onClick={onSave} disabled={!draftName.trim() || saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              {saving ? "Saving" : "Save"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold truncate">{player.name || "Unnamed"}</h1>

            <div className="flex flex-wrap gap-2 mt-1">
              {player.side && (
                <Badge variant="secondary">
                  {player.side === "left" ? "Left" : "Right"}
                </Badge>
              )}
              {level ? (
                <Badge variant="outline">{level.code} — {level.label}</Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">No Level</Badge>
              )}
              {!player.isActive && <Badge variant="destructive">Inactive</Badge>}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Pencil className="mr-2 h-4 w-4" /> Edit
            </Button>
          </div>
        </div>
      )}

      {!player.isActive && (
        <div className="rounded-lg border border-dashed border-warning bg-warning/5 p-4 space-y-3">
          <div className="flex gap-2">
            <UserX className="h-4 w-4 text-warning mt-0.5" />
            <div>
              <p className="text-sm font-medium">This player doesn't have an account</p>
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
