/**
 * PAD-287 — "My connections" (settings.role-scope rule 2), mirroring web's
 * `connections` tab in SettingsPage.tsx: the connection actions that used to
 * sit under Account, regrouped. Nothing here is new behaviour — the
 * 2026-09-06 connections model stands (QR / link / claim / username; no
 * pending requests, no player↔player links).
 */
import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import { router } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { ClaimRequests } from "@/features/players/claim-requests";
import { BlockedUsersCard } from "./account-section";

function LinkRow({
  testID,
  label,
  hint,
  onPress,
}: {
  testID: string;
  label: string;
  hint?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      className="flex-row items-center justify-between rounded-lg border border-border p-3 active:bg-accent"
    >
      <View className="min-w-0 flex-1">
        <Text className="text-base">{label}</Text>
        {hint ? <Text className="text-xs text-muted-foreground">{hint}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={lightTheme.mutedForeground} />
    </Pressable>
  );
}

export function ConnectionsSection() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isCoach = user?.roles?.includes("coach") ?? false;

  return (
    <View className="gap-4" testID="settings-connections">
      <Text className="text-sm text-muted-foreground">{t("settings.connections.description")}</Text>
      {!isCoach ? (
        /* players.claim rule 4: the second place a student answers a coach's
           link request (the first is the dashboard banner). */
        <ClaimRequests variant="list" />
      ) : null}
      {!isCoach ? (
        /* players.join-token rule 8: Settings → My connections is one of the
           three ways a student reaches "Connect with a coach". */
        <Card testID="settings-connect-coach-card">
          <CardContent className="pt-4">
            <LinkRow
              testID="settings-connect-coach"
              label={t("players.connect.settingsLink")}
              onPress={() => router.push("/connect")}
            />
          </CardContent>
        </Card>
      ) : (
        /* players.join-token rule 7: the invite sheet lives on Players; this
           is a way in, not a second copy of it. */
        <Card testID="settings-add-by-qr-card">
          <CardHeader>
            <CardTitle>{t("settings.connections.addByQr")}</CardTitle>
          </CardHeader>
          <CardContent>
            <LinkRow
              testID="settings-add-by-qr"
              label={t("settings.connections.open")}
              hint={t("settings.connections.addByQrHint")}
              onPress={() => router.push({ pathname: "/(tabs)/players", params: { addByQr: "1" } })}
            />
          </CardContent>
        </Card>
      )}
      <BlockedUsersCard />
    </View>
  );
}
