import { authApi } from "@levelup/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";

type ProfileForm = {
  name: string;
  abbreviation: string;
  email: string;
  phone: string;
};

const EMPTY_PROFILE: ProfileForm = {
  name: "",
  abbreviation: "",
  email: "",
  phone: "",
};

/**
 * Editable profile, mirroring web's Profile tab (PAD-81).
 *
 * The previous mobile screen showed name/username/role as read-only text with
 * a comment claiming "/auth/me does not expose email on mobile". That comment
 * was stale — measured against the E2E backend, GET /api/auth/me returns
 * `abbreviation`, `email` and `phone`, and PATCH accepts all three, exactly as
 * `MeResponse` / `UpdateMePayload` declare. So this is the real form.
 *
 * Like web, only CHANGED fields are PATCHed, so opening the pane and saving
 * never re-submits (and re-validates) untouched values. Unlike web there is no
 * page-level Save button to share, so the button lives in the pane.
 *
 * Every control is full-width and one per line — nothing to overflow at 390pt.
 */
export function ProfileSection() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: me } = useQuery({
    queryKey: ["auth-me"],
    queryFn: authApi.getMe,
  });

  const [form, setForm] = React.useState<ProfileForm>(EMPTY_PROFILE);
  const [saved, setSaved] = React.useState<ProfileForm>(EMPTY_PROFILE);
  const [isSaving, setIsSaving] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  // Set on the first keystroke so a late /auth/me can refresh the "what the
  // server has" baseline without wiping what the coach typed.
  const dirtyRef = React.useRef(false);

  React.useEffect(() => {
    if (!me) return;
    const loaded: ProfileForm = {
      name: me.name ?? "",
      abbreviation: me.abbreviation ?? "",
      email: me.email ?? "",
      phone: me.phone ?? "",
    };
    setSaved(loaded);
    if (!dirtyRef.current) setForm(loaded);
  }, [me]);

  const setField = (field: keyof ProfileForm, value: string) => {
    dirtyRef.current = true;
    setStatus(null);
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    const payload: authApi.UpdateMePayload = {};
    if (form.name !== saved.name) payload.name = form.name;
    if (form.abbreviation !== saved.abbreviation)
      payload.abbreviation = form.abbreviation;
    if (form.email !== saved.email) payload.email = form.email;
    if (form.phone !== saved.phone) payload.phone = form.phone;

    setIsSaving(true);
    setStatus(null);
    try {
      const updated = await authApi.updateMe(payload);
      queryClient.setQueryData(["auth-me"], updated);
      // Re-hydrate from the response so the form shows exactly what was
      // stored (trimmed name, uppercased abbreviation, …).
      const confirmed: ProfileForm = {
        name: updated.name ?? "",
        abbreviation: updated.abbreviation ?? "",
        email: updated.email ?? "",
        phone: updated.phone ?? "",
      };
      setForm(confirmed);
      setSaved(confirmed);
      dirtyRef.current = false;
      setStatus(t("settings.mobile.profileSaved"));
      // settings.profile rule 9: a new address is verified right away.
      if (payload.email !== undefined && updated.emailVerification === "pending") {
        router.push("/verify-email?next=/settings" as never);
      }
    } catch {
      setStatus(t("settings.mobile.profileSaveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  const profile = me ?? user;
  const isCoach = profile?.roles?.includes("coach") ?? false;

  return (
    <Card testID="settings-profile">
      <CardHeader>
        <CardTitle>{t("settings.profile.title")}</CardTitle>
        <CardDescription>{t("settings.profile.description")}</CardDescription>
      </CardHeader>
      <CardContent className="gap-4">
        {/* Read-only identity: username and role are not editable anywhere. */}
        <View className="gap-1">
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-sm text-muted-foreground">
              {t("settings.mobile.username")}
            </Text>
            <Text className="flex-shrink text-base font-medium" numberOfLines={1}>
              {profile?.username ? `@${profile.username}` : "—"}
            </Text>
          </View>
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-sm text-muted-foreground">
              {t("settings.mobile.role")}
            </Text>
            <Text className="text-base font-medium">
              {isCoach
                ? t("settings.mobile.roleCoach")
                : t("settings.mobile.rolePlayer")}
            </Text>
          </View>
        </View>

        <View className="gap-1.5">
          <Label>
            {t("settings.profile.name")}
          </Label>
          <Input
            testID="settings-profile-name"
            accessibilityLabel={t("settings.profile.name")}
            value={form.name}
            onChangeText={(v) => setField("name", v)}
          />
        </View>

        <View className="gap-1.5">
          <Label>
            {t("settings.profile.abbreviation")}
          </Label>
          <Input
            testID="settings-profile-abbreviation"
            accessibilityLabel={t("settings.profile.abbreviation")}
            maxLength={4}
            autoCapitalize="characters"
            placeholder={t("settings.profile.abbreviationPlaceholder")}
            value={form.abbreviation}
            onChangeText={(v) => setField("abbreviation", v)}
          />
        </View>

        <View className="gap-1.5">
          <View className="flex-row items-center justify-between gap-3">
            <Label>
              {t("settings.profile.email")}
            </Label>
            {/* auth.email-verification rule 9: the state of the STORED address. */}
            {saved.email && me?.emailVerification === "verified" ? (
              <Text className="text-xs text-success-strong" testID="profile-email-verified">
                {t("settings.profile.emailVerified")}
              </Text>
            ) : saved.email && me?.emailVerification ? (
              <Pressable
                accessibilityRole="link"
                testID="profile-email-verify"
                onPress={() => router.push("/verify-email?next=/settings" as never)}
              >
                <Text className="text-xs text-primary underline">
                  {t("settings.profile.emailUnverified")} · {t("settings.profile.verifyEmail")}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Input
            testID="settings-profile-email"
            accessibilityLabel={t("settings.profile.email")}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={form.email}
            onChangeText={(v) => setField("email", v)}
          />
        </View>

        <View className="gap-1.5">
          <Label>
            {t("settings.profile.phone")}
          </Label>
          <Input
            testID="settings-profile-phone"
            accessibilityLabel={t("settings.profile.phone")}
            keyboardType="phone-pad"
            value={form.phone}
            onChangeText={(v) => setField("phone", v)}
          />
        </View>

        {status ? (
          <Text testID="settings-profile-status" className="text-sm text-muted-foreground">
            {status}
          </Text>
        ) : null}

        <Button
          testID="settings-profile-save"
          accessibilityLabel={t("common.saveChanges")}
          disabled={isSaving}
          onPress={() => void handleSave()}
        >
          <Text>
            {isSaving ? t("settings.mobile.saving") : t("common.saveChanges")}
          </Text>
        </Button>
      </CardContent>
    </Card>
  );
}
