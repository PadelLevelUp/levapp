import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useFieldAvailability } from "@levelup/hooks";
import type { CoachLevel, PlayerSide } from "@levelup/types";
import { playerFormSchema } from "@levelup/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type Option,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { levelOptionLabel } from "./LevelLabel";

export interface PlayerFormValues {
  name: string;
  email: string;
  phone: string;
  levelId?: string;
  side?: PlayerSide;
  notes?: string;
}

interface PlayerFormProps {
  levels: CoachLevel[];
  /** Scopes the duplicate-name warning to this coach's own roster (PAD-17). */
  coachId?: string | null;
  initialValues?: Partial<PlayerFormValues>;
  saving?: boolean;
  submitLabel: string;
  onSubmit: (values: PlayerFormValues) => void;
  onCancel?: () => void;
}

const SIDE_OPTIONS: { value: PlayerSide; labelKey: string }[] = [
  { value: "left", labelKey: "players.sideLeft" },
  { value: "right", labelKey: "players.sideRight" },
  { value: "both", labelKey: "players.sideBoth" },
];

/**
 * Shared create/edit player form, mirroring the web AddPlayerSheet /
 * PlayerDetailPage inline edit: name (required, duplicate WARN only),
 * email (server-side availability check, blocking), phone, level select and
 * side select.
 *
 * PAD-105: there is no username field — a username is the player's own login
 * credential, chosen by them when they activate their account, never by the
 * coach.
 */
export function PlayerForm({
  levels,
  coachId,
  initialValues,
  saving = false,
  submitLabel,
  onSubmit,
  onCancel,
}: PlayerFormProps) {
  const { t } = useTranslation();
  const [name, setName] = React.useState(initialValues?.name ?? "");
  const [email, setEmail] = React.useState(initialValues?.email ?? "");
  const [phone, setPhone] = React.useState(initialValues?.phone ?? "");
  const [notes, setNotes] = React.useState(initialValues?.notes ?? "");
  const [formError, setFormError] = React.useState<string | null>(null);

  const initialLevel = levels.find((l) => l.id === initialValues?.levelId);
  const [levelOption, setLevelOption] = React.useState<Option>(
    initialLevel
      ? {
          value: initialLevel.id,
          label: levelOptionLabel(initialLevel.code, initialLevel.label),
        }
      : undefined
  );
  const initialSide = SIDE_OPTIONS.find(
    (o) => o.value === initialValues?.side
  );
  const [side, setSide] = React.useState<PlayerSide | undefined>(
    initialSide?.value
  );
  // Derived, not stored: keeping the stable side value in state means the
  // visible label re-translates on a language switch.
  const sideOptions = React.useMemo(
    () => SIDE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) })),
    [t]
  );
  const sideOption: Option = sideOptions.find((o) => o.value === side);

  // Availability checks run only when the value differs from the initial one,
  // so editing a player never flags their own current email/name.
  const skipIfUnchanged = (value: string, initial?: string) =>
    value.trim() === (initial ?? "").trim() ? "" : value;

  const emailCheck = useFieldAvailability(
    "user",
    "email",
    skipIfUnchanged(email, initialValues?.email)
  );
  // PAD-17: duplicate name is a non-blocking WARNING scoped to this coach.
  const nameCheck = useFieldAvailability(
    "user",
    "name",
    skipIfUnchanged(name, initialValues?.name),
    coachId
  );

  const hasFieldError = !!emailCheck.error;

  const handleSave = () => {
    const parsed = playerFormSchema.safeParse({
      name,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      levelId: levelOption?.value || undefined,
      side: side || undefined,
      notes: notes.trim() || undefined,
    });
    if (!parsed.success) {
      const raw = parsed.error.issues[0]?.message ?? "players.invalidForm";
      setFormError(t(raw, { defaultValue: raw }));
      return;
    }
    if (hasFieldError) {
      setFormError(emailCheck.error);
      return;
    }
    setFormError(null);
    onSubmit({
      name: parsed.data.name,
      email: email.trim(),
      phone: phone.trim(),
      levelId: levelOption?.value || undefined,
      side: side || undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <View className="gap-5">
      <View className="gap-2">
        <Label>{t("players.name")}</Label>
        <View className="relative">
          <Input
            testID="player-name"
            accessibilityLabel={t("players.playerNamePlaceholder")}
            placeholder={t("players.namePlaceholder")}
            value={name}
            onChangeText={setName}
            className={nameCheck.error ? "border-warning" : undefined}
          />
          {nameCheck.checking ? (
            <View className="absolute right-3 top-1/2 -translate-y-1/2">
              <Spinner size="small" />
            </View>
          ) : null}
        </View>
        {nameCheck.error ? (
          <Text className="text-sm text-warning">
            {nameCheck.error}. You can still save this player if that's
            intentional.
          </Text>
        ) : null}
      </View>

      <View className="gap-2">
        <Label>{t("players.emailOptional")}</Label>
        <View className="relative">
          <Input
            testID="player-email"
            accessibilityLabel={t("players.playerEmailAria")}
            placeholder={t("players.emailPlaceholder")}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            className={emailCheck.error ? "border-destructive" : undefined}
          />
          {emailCheck.checking ? (
            <View className="absolute right-3 top-1/2 -translate-y-1/2">
              <Spinner size="small" />
            </View>
          ) : null}
        </View>
        {emailCheck.error ? (
          <Text className="text-sm text-destructive">{emailCheck.error}</Text>
        ) : null}
      </View>

      <View className="gap-2">
        <Label>{t("players.phoneOptional")}</Label>
        <Input
          testID="player-phone"
          accessibilityLabel={t("players.playerPhoneAria")}
          placeholder={t("players.phonePlaceholder")}
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />
      </View>

      <View className="gap-2">
        <Label>{t("players.levelOptional")}</Label>
        <Select value={levelOption} onValueChange={setLevelOption}>
          <SelectTrigger
            testID="player-level-select"
            accessibilityLabel={t("players.selectLevel")}
          >
            <SelectValue placeholder={t("players.selectLevel")} />
          </SelectTrigger>
          <SelectContent>
            {levels.map((lvl) => (
              <SelectItem
                key={lvl.id}
                value={lvl.id}
                label={levelOptionLabel(lvl.code, lvl.label)}
              />
            ))}
          </SelectContent>
        </Select>
        {levels.length === 0 ? (
          <Text className="text-sm text-muted-foreground">
            {t("players.noLevelsSelectHint")}
          </Text>
        ) : null}
      </View>

      <View className="gap-2">
        <Label>{t("players.sideOptional")}</Label>
        <Select
          value={sideOption}
          onValueChange={(opt) => setSide(opt?.value as PlayerSide | undefined)}
        >
          <SelectTrigger
            testID="player-side-select"
            accessibilityLabel={t("players.selectSide")}
          >
            <SelectValue placeholder={t("players.selectSide")} />
          </SelectTrigger>
          <SelectContent>
            {sideOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} label={opt.label} />
            ))}
          </SelectContent>
        </Select>
      </View>

      <View className="gap-2">
        <Label>{t("players.notesOptional")}</Label>
        <Textarea
          testID="player-notes"
          accessibilityLabel={t("players.playerNotesAria")}
          placeholder={t("players.notesPlaceholder")}
          value={notes}
          onChangeText={setNotes}
        />
      </View>

      {formError ? (
        <Text className="text-sm text-destructive">{formError}</Text>
      ) : null}

      <View className="mt-1 gap-2">
        <Button
          testID="player-save"
          accessibilityLabel={submitLabel}
          disabled={!name.trim() || hasFieldError || saving}
          onPress={handleSave}
        >
          {saving ? <Spinner size="small" color="white" /> : null}
          <Text>{submitLabel}</Text>
        </Button>
        {onCancel ? (
          <Button
            variant="outline"
            accessibilityLabel={t("common.cancel")}
            disabled={saving}
            onPress={onCancel}
          >
            <Text>{t("common.cancel")}</Text>
          </Button>
        ) : null}
      </View>
    </View>
  );
}
