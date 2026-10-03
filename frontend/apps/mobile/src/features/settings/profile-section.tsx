import { authApi } from "@levelup/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
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
import { useSectionSave } from "@/features/settings/unsaved-registry";
import { writeAuthMe } from "@/features/settings/write-auth-me";

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
 * settings.unsaved-edits rule 2 — "differs by value from the last loaded or saved
 * value", not "was touched": a field typed and then typed back to `saved`'s value is
 * NOT unsaved. Exported so this comparison is covered by a pure-function test as well
 * as the mount-based one (both are cheap here; `form`/`saved` were already tracked).
 */
export function isProfileUnsaved(form: ProfileForm, saved: ProfileForm): boolean {
  return (
    form.name !== saved.name ||
    form.abbreviation !== saved.abbreviation ||
    form.email !== saved.email ||
    form.phone !== saved.phone
  );
}

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
 * never re-submits (and re-validates) untouched values. settings.explicit-save (PAD-506): the
 * screen's one "Guardar alterações" (`settings-profile-save`) saves it.
 *
 * Every control is full-width and one per line — nothing to overflow at 390pt.
 */
export function ProfileSection({ focusEmail = false }: { focusEmail?: boolean }) {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();

  const { data: me } = useQuery({
    queryKey: ["auth-me"],
    queryFn: authApi.getMe,
  });

  const [form, setForm] = React.useState<ProfileForm>(EMPTY_PROFILE);
  const [saved, setSaved] = React.useState<ProfileForm>(EMPTY_PROFILE);
  // The fields the coach has edited, so a late /auth/me refreshes the "what the server has" baseline
  // and fills every OTHER field without wiping what they typed. B-263: one flag for the whole form
  // left an untouched name empty, and the save then sent `name: ""` and was refused.
  const touchedRef = React.useRef(new Set<keyof ProfileForm>());

  React.useEffect(() => {
    if (!me) return;
    const loaded: ProfileForm = {
      name: me.name ?? "",
      abbreviation: me.abbreviation ?? "",
      email: me.email ?? "",
      phone: me.phone ?? "",
    };
    setSaved(loaded);
    setForm((current) => {
      const next = { ...loaded };
      // #509 review: a field touched but left empty before the read lands takes the loaded value.
      for (const field of touchedRef.current) if (current[field].trim()) next[field] = current[field];
      return next;
    });
  }, [me]);

  const setField = (field: keyof ProfileForm, value: string) => {
    touchedRef.current.add(field);
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  // settings.explicit-save rule 3: this section's part of the screen's one Save; throws on failure.
  const save = async () => {
    const payload: authApi.UpdateMePayload = {};
    if (form.name !== saved.name) payload.name = form.name;
    if (form.abbreviation !== saved.abbreviation)
      payload.abbreviation = form.abbreviation;
    if (form.email !== saved.email) payload.email = form.email;
    if (form.phone !== saved.phone) payload.phone = form.phone;

    if (Object.keys(payload).length === 0) return;
    const updated = await authApi.updateMe(payload);
    await writeAuthMe(queryClient, updated);
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
    touchedRef.current.clear();
    // settings.profile rule 9: a new address is verified right away.
    if (payload.email !== undefined && updated.emailVerification === "pending") {
      // B-050: the verify screen reads the signed-in user; refresh it first, or a
      // coach who was already verified is sent straight back here.
      await refreshUser();
      router.push("/verify-email?next=/settings" as never);
    }
  };
  useSectionSave("profile", isProfileUnsaved(form, saved), { label: t("settings.profile.title"), save });

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
            autoFocus={focusEmail}
            value={form.email}
            onChangeText={(v) => setField("email", v)}
          />
          {/* PAD-482 (rule 14): a coach with no email cannot recover a password. */}
          {/* Only once /auth/me has answered, or it flashes for a coach who has an email (#509 review). */}
          {me?.roles?.includes("coach") && !form.email.trim() ? (
            <Text testID="settings-profile-email-needed" className="text-xs text-muted-foreground">
              {t("settings.profile.emailNeeded")}
            </Text>
          ) : null}
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

      </CardContent>
    </Card>
  );
}
