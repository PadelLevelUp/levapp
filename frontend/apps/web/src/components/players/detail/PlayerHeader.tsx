import { useTranslation } from "react-i18next";
import type { CoachPlayer, CoachLevel } from "@/types";
import { SIDE_LABEL_KEYS } from "@/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { NICKNAME_MAX, nicknameShown } from "@levelup/config";
import { BellOff, Check, Loader2, Pencil, X } from "lucide-react";
import { LevelLabel } from "@/components/LevelLabel";

interface PlayerHeaderProps {
  player: CoachPlayer;
  levels: CoachLevel[];
  isEditing: boolean;
  saving?: boolean;
  draftName: string;
  /** PAD-660: the coach's private nickname for this student (players.nickname rule 6). */
  draftNickname: string;
  draftNicknameAsName: boolean;
  nicknameError?: boolean;
  onDraftNicknameChange: (v: string) => void;
  onDraftNicknameAsNameChange: (v: boolean) => void;
  onDraftNameChange: (v: string) => void;
  onEdit: () => void;
  /** players.profile rule 8 (PAD-834): disabled while Block 1 is in edit mode. */
  editDisabled?: boolean;
  onSave: () => void;
  onCancel: () => void;
}

export function PlayerHeader({
  player,
  levels,
  isEditing,
  saving = false,
  draftName,
  draftNickname,
  draftNicknameAsName,
  nicknameError = false,
  onDraftNicknameChange,
  onDraftNicknameAsNameChange,
  onDraftNameChange,
  onEdit,
  editDisabled = false,
  onSave,
  onCancel,
}: PlayerHeaderProps) {
  const { t } = useTranslation();
  const pending = player.pendingRegistration === true;

  const displayName = isEditing ? draftName : (player.displayName || player.name || "");
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const level = player.level ?? levels.find((l) => l.id === String(player.levelId));
  return (
    <div className="space-y-4">
      {isEditing ? (
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 shrink-0">
              <AvatarFallback className="bg-primary text-primary-foreground text-xl font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <Input
              value={draftName}
              onChange={(e) => onDraftNameChange(e.target.value)}
              className="flex-1 text-lg font-semibold"
              placeholder={t("players.playerNamePlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="player-nickname">
              {t("players.nickname.label")}
            </label>
            <Input
              id="player-nickname"
              data-testid="player-nickname"
              value={draftNickname}
              maxLength={NICKNAME_MAX}
              onChange={(e) => onDraftNicknameChange(e.target.value)}
              placeholder={t("players.nickname.placeholder")}
            />
            <p className="text-xs text-muted-foreground" data-testid="player-nickname-warning">
              {t("players.nickname.warning")}
            </p>
            {nicknameError && (
              <p className="text-xs text-destructive" role="alert" data-testid="player-nickname-error">
                {t("players.nickname.tooLong")}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Switch
                id="player-nickname-as-name"
                data-testid="player-nickname-as-name"
                checked={draftNicknameAsName}
                onCheckedChange={onDraftNicknameAsNameChange}
              />
              <label className="text-sm" htmlFor="player-nickname-as-name">
                {t("players.nickname.asName")}
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={onCancel} disabled={saving} data-testid="player-edit-cancel">
              <X className="mr-2 h-4 w-4" /> {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={onSave} disabled={!draftName.trim() || saving} data-testid="player-save">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              {saving ? t("players.saving") : t("common.save")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <Avatar
            className={`h-16 w-16 shrink-0 ${pending ? "border-2 border-dashed border-violet-400" : ""}`}
            data-testid={pending ? "player-avatar-pending" : undefined}
          >
            <AvatarFallback
              className={`text-xl font-bold ${pending ? "bg-transparent text-muted-foreground" : "bg-primary text-primary-foreground"}`}
            >
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold truncate">{player.displayName || player.name || t("players.unnamed")}</h1>
            {nicknameShown(player) && (
              <p className="text-sm text-muted-foreground truncate" data-testid="player-real-name">
                {player.name}
              </p>
            )}

            <div className="flex flex-wrap gap-2 mt-1">
              {player.side && (
                <Badge variant="secondary" data-testid="player-side-badge" data-state={player.side}>
                  {t(SIDE_LABEL_KEYS[player.side])}
                </Badge>
              )}
              {level ? (
                <Badge variant="outline" data-testid="player-level-badge"><LevelLabel code={level.code} label={level.label} /></Badge>
              ) : (
                // players.profile rule 9 (PAD-834): amber, and it replaces the old grey "Sem nível".
                <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning-strong" data-testid="player-chip-no-level">
                  {t("players.card.noLevel")}
                </Badge>
              )}
              {!player.side && (
                <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning-strong" data-testid="player-chip-no-side">
                  {t("players.card.noSide")}
                </Badge>
              )}
              {/* players.profile rule 11 (PAD-834): "Registo pendente" replaces "Inativo" for a pending
                  player; an inactive player with a password, who is not pending, keeps "Inativo". */}
              {pending ? (
                <Badge
                  variant="outline"
                  className="border-violet-300 text-violet-700 dark:border-violet-800 dark:text-violet-300"
                  data-testid="player-chip-pending"
                >
                  {t("players.card.pendingChip")}
                </Badge>
              ) : (
                !player.isActive && <Badge variant="destructive" data-testid="player-chip-inactive">{t("players.inactive")}</Badge>
              )}
              {/* PAD-112: the student switched off class-invitation
                  notifications themselves. Shown so the coach reads a silent
                  student as a deliberate choice rather than as someone
                  ignoring them; the reason they gave is in PlayerInfoBlock. */}
              {player.notificationsBlocked && (
                <Badge
                  variant="outline"
                  className="border-amber-500 text-amber-600 dark:text-amber-400 gap-1"
                  data-testid="player-notifications-blocked-badge"
                >
                  <BellOff className="h-3 w-3" />
                  {t("players.notificationsBlockedBadge")}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onEdit} disabled={editDisabled} data-testid="player-edit">
              <Pencil className="mr-2 h-4 w-4" /> {t("common.edit")}
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}
