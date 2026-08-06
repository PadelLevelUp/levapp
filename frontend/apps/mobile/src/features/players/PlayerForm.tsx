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

const SIDE_OPTIONS: { value: PlayerSide; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "both", label: "Both" },
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
  const [sideOption, setSideOption] = React.useState<Option>(
    initialSide ? { ...initialSide } : undefined
  );

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
      side: (sideOption?.value as PlayerSide) || undefined,
      notes: notes.trim() || undefined,
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Invalid form");
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
      side: (sideOption?.value as PlayerSide) || undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <View className="gap-5">
      <View className="gap-2">
        <Label>Name</Label>
        <View className="relative">
          <Input
            testID="player-name"
            accessibilityLabel="Player name"
            placeholder="e.g. John Doe"
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
        <Label>Email (optional)</Label>
        <View className="relative">
          <Input
            testID="player-email"
            accessibilityLabel="Player email"
            placeholder="e.g. john@email.com"
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
        <Label>Phone (optional)</Label>
        <Input
          testID="player-phone"
          accessibilityLabel="Player phone"
          placeholder="e.g. +351 9xx xxx xxx"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />
      </View>

      <View className="gap-2">
        <Label>Level (optional)</Label>
        <Select value={levelOption} onValueChange={setLevelOption}>
          <SelectTrigger
            testID="player-level-select"
            accessibilityLabel="Select level"
          >
            <SelectValue placeholder="Select level" />
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
            No levels defined yet — create levels in Settings to assign one.
          </Text>
        ) : null}
      </View>

      <View className="gap-2">
        <Label>Side (optional)</Label>
        <Select value={sideOption} onValueChange={setSideOption}>
          <SelectTrigger
            testID="player-side-select"
            accessibilityLabel="Select side"
          >
            <SelectValue placeholder="Select side" />
          </SelectTrigger>
          <SelectContent>
            {SIDE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} label={opt.label} />
            ))}
          </SelectContent>
        </Select>
      </View>

      <View className="gap-2">
        <Label>{t("players.notesOptional")}</Label>
        <Textarea
          testID="player-notes"
          accessibilityLabel="Player notes"
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
            accessibilityLabel="Cancel"
            disabled={saving}
            onPress={onCancel}
          >
            <Text>Cancel</Text>
          </Button>
        ) : null}
      </View>
    </View>
  );
}
