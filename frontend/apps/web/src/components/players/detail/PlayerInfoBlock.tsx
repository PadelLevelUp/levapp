import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BellOff, Check, Loader2, Mail, Pencil, Phone, X } from "lucide-react";
import {
  infoCanSave,
  infoChanges,
  infoDraftOf,
  infoEmailEditable,
  infoRequired,
  missingSetup,
  type InfoDraft,
  type InfoEditSession,
} from "@levelup/config";
import type { CoachLevel, CoachPlayer, PlayerSide } from "@/types";
import { SIDE_LABEL_KEYS } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LevelLabel } from "@/components/LevelLabel";

interface PlayerInfoBlockProps {
  player: CoachPlayer;
  levels: CoachLevel[];
  /** null in read mode; otherwise how the edit was opened (players.profile rule 8). */
  session: InfoEditSession | null;
  onEdit: () => void;
  onCancel: () => void;
  /** Sends the changed keys; resolves once the server answered. */
  onSave: (updates: Record<string, string | null>) => Promise<void>;
  /** True while the header's own edit is open (rule 8: never two edits at once). */
  editDisabled?: boolean;
}

/**
 * players.profile rule 8 (PAD-834): Block 1, Informação — e-mail, phone, level and side, then
 * the coach's note and the notifications-blocked detail. Its own Editar; Guardar sends only what
 * changed. A select is required only when it has options, and blocks Guardar only in the session
 * opened by "Completar informação" (rule 9).
 */
export function PlayerInfoBlock({
  player,
  levels,
  session,
  onEdit,
  onCancel,
  onSave,
  editDisabled = false,
}: PlayerInfoBlockProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<InfoDraft>(() => infoDraftOf(player));
  const [saving, setSaving] = useState(false);
  const levelTriggerRef = useRef<HTMLButtonElement>(null);
  const sideTriggerRef = useRef<HTMLButtonElement>(null);

  const editing = session !== null;
  const hasLevels = levels.length > 0;
  const required = infoRequired(hasLevels);
  const emailEditable = infoEmailEditable(player);
  const missing = missingSetup(player);

  // A fresh draft each time the edit opens; "Completar informação" focuses the first missing select.
  useEffect(() => {
    if (!editing) return;
    setDraft(infoDraftOf(player));
    if (session === "complete") {
      const target = missing[0] === "level" && hasLevels ? levelTriggerRef.current : sideTriggerRef.current;
      target?.focus();
      target?.scrollIntoView?.({ block: "nearest" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const canSave = editing && infoCanSave({ session, hasLevels, draft, saving });
  const set = <K extends keyof InfoDraft>(key: K, value: InfoDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const handleSave = async () => {
    const updates = infoChanges(player, draft);
    if (Object.keys(updates).length === 0) {
      onCancel();
      return;
    }
    setSaving(true);
    try {
      await onSave(updates);
    } finally {
      setSaving(false);
    }
  };

  const level = player.level ?? levels.find((l) => l.id === String(player.levelId));
  const unset = (testId: string) => (
    <span className="rounded px-1.5 py-0.5 text-warning-strong bg-warning/10 border border-warning/40" data-testid={testId}>
      {t("players.card.notSet")}
    </span>
  );
  const fieldLabel = (key: string, isRequired: boolean) => (
    <span className="text-xs text-muted-foreground">
      {t(key)}
      {isRequired && (
        <span className="text-destructive" aria-label={t("players.card.requiredMark")}> *</span>
      )}
    </span>
  );

  return (
    <Card data-testid="player-info-card" data-editing={editing ? session : "false"}>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg">{t("players.info")}</CardTitle>
        {!editing && (
          <Button variant="outline" size="sm" onClick={onEdit} disabled={editDisabled} data-testid="player-info-edit">
            <Pencil className="mr-2 h-4 w-4" /> {t("common.edit")}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* PAD-731: e-mail and phone behind their icons, no literal label. */}
          <div className="flex items-center gap-2 min-w-0">
            <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
            {editing && emailEditable ? (
              <Input
                value={draft.email}
                data-testid="player-info-email-input"
                onChange={(e) => set("email", e.target.value)}
                placeholder={t("players.emailFieldPlaceholder")}
                className="h-8 text-sm"
              />
            ) : (
              <span className="truncate" data-testid="player-info-email">
                {player.email ||
                  (player.pendingRegistration === true ? t("players.card.emailAtRegistration") : t("players.noEmail"))}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 min-w-0">
            <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
            {editing ? (
              <Input
                value={draft.phone}
                data-testid="player-info-phone-input"
                onChange={(e) => set("phone", e.target.value)}
                placeholder={t("players.phoneFieldPlaceholder")}
                className="h-8 text-sm"
              />
            ) : (
              <span className="truncate" data-testid="player-info-phone">{player.phone || t("players.noPhone")}</span>
            )}
          </div>

          <div className="flex flex-col gap-1 min-w-0">
            {fieldLabel("players.card.levelField", editing && required.level)}
            {editing ? (
              hasLevels ? (
                <Select value={draft.levelId} onValueChange={(v) => set("levelId", v)}>
                  <SelectTrigger
                    ref={levelTriggerRef}
                    className="h-9"
                    data-testid="player-level-select"
                    data-selected-level-id={draft.levelId}
                    aria-required={required.level}
                  >
                    <SelectValue placeholder={t("players.card.notSet")} />
                  </SelectTrigger>
                  <SelectContent>
                    {levels.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        <LevelLabel code={l.code} label={l.label} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-muted-foreground">{t("players.noLevelsSelectHint")}</span>
              )
            ) : level ? (
              <span data-testid="player-info-level"><LevelLabel code={level.code} label={level.label} /></span>
            ) : (
              unset("player-info-level-unset")
            )}
          </div>

          <div className="flex flex-col gap-1 min-w-0">
            {fieldLabel("players.card.sideField", editing && required.side)}
            {editing ? (
              <Select value={draft.side} onValueChange={(v) => set("side", v as PlayerSide)}>
                <SelectTrigger
                  ref={sideTriggerRef}
                  className="h-9"
                  data-testid="player-side-select"
                  data-selected-side={draft.side}
                  aria-required={required.side}
                >
                  <SelectValue placeholder={t("players.card.notSet")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">{t("players.sideLeft")}</SelectItem>
                  <SelectItem value="right">{t("players.sideRight")}</SelectItem>
                  <SelectItem value="both">{t("players.sideBoth")}</SelectItem>
                </SelectContent>
              </Select>
            ) : player.side ? (
              <span data-testid="player-info-side">{t(SIDE_LABEL_KEYS[player.side])}</span>
            ) : (
              unset("player-info-side-unset")
            )}
          </div>
        </div>

        {(player.notes || editing) && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-1">{t("players.notes")}</p>
            {editing ? (
              <Input
                value={draft.notes}
                data-testid="player-notes"
                onChange={(e) => set("notes", e.target.value)}
                placeholder={t("players.notesPlaceholder")}
                className="h-8 text-sm"
              />
            ) : (
              <p data-testid="player-notes-text">{player.notes}</p>
            )}
          </div>
        )}

        {editing && (
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onCancel} disabled={saving} data-testid="player-info-cancel">
              <X className="mr-2 h-4 w-4" /> {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!canSave} data-testid="player-info-save">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              {saving ? t("players.saving") : t("common.save")}
            </Button>
          </div>
        )}

        {/* PAD-112: the student's own explanation for cutting notifications. Read-only for the coach. */}
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
            <p className="text-xs text-muted-foreground mt-2 mb-1">{t("players.notificationsBlockedReason")}</p>
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
