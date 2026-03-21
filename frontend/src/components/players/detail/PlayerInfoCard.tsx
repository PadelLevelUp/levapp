import type { CoachPlayer } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Mail, Phone, User } from "lucide-react";

interface PlayerInfoCardProps {
  player: CoachPlayer;
  isEditing: boolean;
  draftUsername: string;
  draftEmail: string;
  draftPhone: string;
  draftNotes: string;
  onDraftUsernameChange: (v: string) => void;
  onDraftEmailChange: (v: string) => void;
  onDraftPhoneChange: (v: string) => void;
  onDraftNotesChange: (v: string) => void;
}

export function PlayerInfoCard({
  player,
  isEditing,
  draftUsername,
  draftEmail,
  draftPhone,
  draftNotes,
  onDraftUsernameChange,
  onDraftEmailChange,
  onDraftPhoneChange,
  onDraftNotesChange,
}: PlayerInfoCardProps) {
  const isInactive = !player.isActive;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Info</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground shrink-0" />
          {isEditing && isInactive ? (
            <Input
              value={draftUsername}
              onChange={(e) => onDraftUsernameChange(e.target.value)}
              placeholder="Username"
              className="h-7 text-sm"
            />
          ) : (
            <span>{player.username || "No username"}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
          {isEditing && isInactive ? (
            <Input
              value={draftEmail}
              onChange={(e) => onDraftEmailChange(e.target.value)}
              placeholder="Email"
              className="h-7 text-sm"
            />
          ) : (
            <span>{player.email || "No email"}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
          {isEditing && isInactive ? (
            <Input
              value={draftPhone}
              onChange={(e) => onDraftPhoneChange(e.target.value)}
              placeholder="Phone"
              className="h-7 text-sm"
            />
          ) : (
            <span>{player.phone || "No phone"}</span>
          )}
        </div>

        {(player.notes || isEditing) && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            {isEditing ? (
              <Input
                value={draftNotes}
                onChange={(e) => onDraftNotesChange(e.target.value)}
                placeholder="Anything you want to remember..."
                className="h-7 text-sm"
              />
            ) : (
              <p>{player.notes}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
