import type { CoachPlayer } from "@/types";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Mail, Phone } from "lucide-react";

interface PlayerInfoCardProps {
  player: CoachPlayer;
  isEditing: boolean;
  draftEmail: string;
  draftPhone: string;
  draftNotes: string;
  onDraftEmailChange: (v: string) => void;
  onDraftPhoneChange: (v: string) => void;
  onDraftNotesChange: (v: string) => void;
}

export function PlayerInfoCard({
  player,
  isEditing,
  draftEmail,
  draftPhone,
  draftNotes,
  onDraftEmailChange,
  onDraftPhoneChange,
  onDraftNotesChange,
}: PlayerInfoCardProps) {
  const { t } = useTranslation();
  const isInactive = !player.isActive;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{t("players.info")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* PAD-105: the username is the player's own credential, chosen at
            account activation. Until then the record holds a generated
            placeholder, so nothing username-shaped is shown to the coach. */}
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
          {isEditing && isInactive ? (
            <Input
              value={draftEmail}
              onChange={(e) => onDraftEmailChange(e.target.value)}
              placeholder={t("players.emailFieldPlaceholder")}
              className="h-7 text-sm"
            />
          ) : (
            <span>{player.email || t("players.noEmail")}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
          {isEditing && isInactive ? (
            <Input
              value={draftPhone}
              onChange={(e) => onDraftPhoneChange(e.target.value)}
              placeholder={t("players.phoneFieldPlaceholder")}
              className="h-7 text-sm"
            />
          ) : (
            <span>{player.phone || t("players.noPhone")}</span>
          )}
        </div>

        {(player.notes || isEditing) && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-1">{t("players.notes")}</p>
            {isEditing ? (
              <Input
                value={draftNotes}
                onChange={(e) => onDraftNotesChange(e.target.value)}
                placeholder={t("players.notesPlaceholder")}
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
