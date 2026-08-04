import type { CoachPlayer } from "@/types";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BellOff, Mail, Phone, User } from "lucide-react";

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
  const { t } = useTranslation();
  const isInactive = !player.isActive;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{t("players.info")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground shrink-0" />
          {isEditing && isInactive ? (
            <Input
              value={draftUsername}
              onChange={(e) => onDraftUsernameChange(e.target.value)}
              placeholder={t("players.usernameFieldPlaceholder")}
              className="h-7 text-sm"
            />
          ) : (
            <span>{player.username || t("players.noUsername")}</span>
          )}
        </div>

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

        {/* PAD-112: the student's own explanation for cutting notifications.
            READ-ONLY for the coach — they may see it (that is the whole point
            of the field) but it belongs to the student and is edited only from
            the student's Settings. Note the contrast with a PAD-107
            availability blocker, whose title/description/hours are the
            student's private calendar and are never shown here. */}
        {player.notificationsBlocked && (
          <div className="pt-2 border-t" data-testid="player-notifications-blocked-detail">
            <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <BellOff className="h-3 w-3" />
              {t("players.notificationsBlockedTitle")}
            </p>
            <ul className="text-sm list-disc list-inside text-muted-foreground">
              {player.blockAllNotifications && <li>{t("players.notificationsBlockedAll")}</li>}
              {player.blockAutoInvitations && <li>{t("players.notificationsBlockedAuto")}</li>}
              {player.blockManualInvitations && <li>{t("players.notificationsBlockedManual")}</li>}
            </ul>
            <p className="text-xs text-muted-foreground mt-2 mb-1">
              {t("players.notificationsBlockedReason")}
            </p>
            <p data-testid="player-notifications-blocked-reason">
              {player.notificationBlockReason?.trim()
                ? player.notificationBlockReason
                : t("players.notificationsBlockedNoReason")}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
