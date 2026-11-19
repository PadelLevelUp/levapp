/**
 * players.profile rule 8 (PAD-834): Block 1, Informação, on the player screen — the web twin is
 * `PlayerInfoBlock.tsx`, with the same ids and the same shared rules (`@levelup/config`
 * player-card.ts): its own Editar, Guardar sends only what changed, and an empty required select
 * blocks Guardar only in the session opened by "Completar informação".
 */
import * as React from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  infoCanSave,
  infoChanges,
  infoDraftOf,
  infoEmailEditable,
  infoRequired,
  type InfoDraft,
  type InfoEditSession,
} from "@levelup/config";
import type { CoachLevel, CoachPlayer, PlayerSide } from "@levelup/types";
import { SIDE_LABEL_KEYS } from "@levelup/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, type Option } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { LevelLabel, levelOptionLabel } from "./LevelLabel";
import { PlayerContactRows } from "./player-contact-rows";

const SIDES: PlayerSide[] = ["left", "right", "both"];

export function PlayerInfoBlock({
  player,
  levels,
  session,
  onEdit,
  onCancel,
  onSave,
  editDisabled = false,
  children,
}: {
  player: CoachPlayer;
  levels: CoachLevel[];
  /** null in read mode; otherwise how the edit was opened. */
  session: InfoEditSession | null;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (updates: Record<string, string | null>) => Promise<void>;
  /** True while the header form is open (rule 8: never two edits at once). */
  editDisabled?: boolean;
  /** The notifications-blocked detail, rendered under the fields as today. */
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = React.useState<InfoDraft>(() => infoDraftOf(player));
  const [saving, setSaving] = React.useState(false);
  const editing = session !== null;
  const hasLevels = levels.length > 0;
  const required = infoRequired(hasLevels);
  const emailEditable = infoEmailEditable(player);

  React.useEffect(() => {
    if (editing) setDraft(infoDraftOf(player));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const set = <K extends keyof InfoDraft>(key: K, value: InfoDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const canSave = editing && infoCanSave({ session, hasLevels, draft, saving });

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
  const draftLevel = levels.find((l) => l.id === draft.levelId);
  const levelOption: Option = draftLevel
    ? { value: draftLevel.id, label: levelOptionLabel(draftLevel.code, draftLevel.label) }
    : undefined;
  const sideOption: Option = draft.side ? { value: draft.side, label: t(SIDE_LABEL_KEYS[draft.side]) } : undefined;

  const unset = (testID: string) => (
    <View className="self-start rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5" testID={testID}>
      <Text className="text-sm text-warning-strong">{t("players.card.notSet")}</Text>
    </View>
  );
  const fieldLabel = (key: string, isRequired: boolean) => (
    <Text className="text-xs text-muted-foreground">
      {t(key)}
      {isRequired ? <Text className="text-destructive"> *</Text> : null}
    </Text>
  );

  return (
    <Card testID="player-info-card">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>{t("players.info")}</CardTitle>
        {!editing ? (
          <Button
            variant="outline"
            size="sm"
            testID="player-info-edit"
            accessibilityLabel={t("common.edit")}
            disabled={editDisabled}
            onPress={onEdit}
          >
            <Text>{t("common.edit")}</Text>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="gap-3">
        {editing ? (
          <View className="gap-3">
            {emailEditable ? (
              <View className="gap-1">
                <Label>{t("players.emailOptional")}</Label>
                <Input
                  testID="player-info-email-input"
                  accessibilityLabel={t("players.playerEmailAria")}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  value={draft.email}
                  onChangeText={(v) => set("email", v)}
                />
              </View>
            ) : null}
            <View className="gap-1">
              <Label>{t("players.phoneOptional")}</Label>
              <Input
                testID="player-info-phone-input"
                accessibilityLabel={t("players.playerPhoneAria")}
                keyboardType="phone-pad"
                value={draft.phone}
                onChangeText={(v) => set("phone", v)}
              />
            </View>
            <View className="gap-1">
              {fieldLabel("players.card.levelField", required.level)}
              {hasLevels ? (
                <Select value={levelOption} onValueChange={(opt) => set("levelId", opt?.value ?? "")}>
                  <SelectTrigger testID="player-level-select" accessibilityLabel={t("players.selectLevel")}>
                    <SelectValue placeholder={t("players.card.notSet")} />
                  </SelectTrigger>
                  <SelectContent>
                    {levels.map((lvl) => (
                      <SelectItem key={lvl.id} testID={`player-level-option-${lvl.id}`} value={lvl.id} label={levelOptionLabel(lvl.code, lvl.label)} />
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Text className="text-sm text-muted-foreground">{t("players.noLevelsSelectHint")}</Text>
              )}
            </View>
            <View className="gap-1">
              {fieldLabel("players.card.sideField", required.side)}
              <Select value={sideOption} onValueChange={(opt) => set("side", (opt?.value ?? "") as PlayerSide | "")}>
                <SelectTrigger testID="player-side-select" accessibilityLabel={t("players.selectSide")}>
                  <SelectValue placeholder={t("players.card.notSet")} />
                </SelectTrigger>
                <SelectContent>
                  {SIDES.map((s) => (
                    <SelectItem key={s} testID={`player-side-option-${s}`} value={s} label={t(SIDE_LABEL_KEYS[s])} />
                  ))}
                </SelectContent>
              </Select>
            </View>
            <View className="gap-1">
              <Label>{t("players.notesOptional")}</Label>
              <Textarea
                testID="player-notes"
                accessibilityLabel={t("players.playerNotesAria")}
                value={draft.notes}
                onChangeText={(v) => set("notes", v)}
              />
            </View>
            <View className="flex-row justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                testID="player-info-cancel"
                accessibilityLabel={t("common.cancel")}
                disabled={saving}
                onPress={onCancel}
              >
                <Text>{t("common.cancel")}</Text>
              </Button>
              <Button
                size="sm"
                testID="player-info-save"
                accessibilityLabel={t("common.save")}
                disabled={!canSave}
                onPress={() => void handleSave()}
              >
                {saving ? <Spinner size="small" color="white" /> : null}
                <Text>{t("common.save")}</Text>
              </Button>
            </View>
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-y-3">
            {/* PAD-731: e-mail and phone behind their icons, no literal label. */}
            <View className="w-full">
              <PlayerContactRows
                email={player.email}
                phone={player.phone}
                emptyEmailKey={player.pendingRegistration === true ? "players.card.emailAtRegistration" : "players.noEmail"}
              />
            </View>
            <View className="w-1/2 gap-1 pr-2">
              {fieldLabel("players.card.levelField", false)}
              {level ? (
                <View testID="player-info-level">
                  <LevelLabel code={level.code} label={level.label} />
                </View>
              ) : (
                unset("player-info-level-unset")
              )}
            </View>
            <View className="w-1/2 gap-1">
              {fieldLabel("players.card.sideField", false)}
              {player.side ? (
                <Text className="text-sm" testID="player-info-side">{t(SIDE_LABEL_KEYS[player.side])}</Text>
              ) : (
                unset("player-info-side-unset")
              )}
            </View>
            {player.notes ? (
              <View className="w-full border-t border-border pt-2">
                <Text className="text-xs text-muted-foreground">{t("players.notes")}</Text>
                <Text className="text-sm" testID="player-notes-text">{player.notes}</Text>
              </View>
            ) : null}
          </View>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
