import { Ionicons } from "@expo/vector-icons";
import { messagesApi } from "@levelup/api";
import { lightTheme } from "@levelup/config";
import type { BlockedUser } from "@levelup/types";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { ActivityIndicator, Linking, Pressable, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { DeleteAccountSection } from "@/features/settings/delete-account-section";
import { ClaimRequests } from "@/features/players/claim-requests";
import { PRIVACY_POLICY_URL, TERMS_URL } from "@/lib/config";

function LegalLinkRow({
  label,
  url,
  testID,
}: {
  label: string;
  url: string;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={() => void Linking.openURL(url)}
      className="flex-row items-center justify-between rounded-lg border border-border p-3 active:bg-accent"
    >
      <Text className="flex-1 text-base">{label}</Text>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={lightTheme.mutedForeground}
      />
    </Pressable>
  );
}

/**
 * messaging.block-and-report rule 10 (PAD-215): the viewer's own blocks,
 * manageable outside the thread — both roles. Mirrors web's BlockedUsersSection.
 */
function BlockedUsersCard() {
  const { t } = useTranslation();
  const [users, setUsers] = React.useState<BlockedUser[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    messagesApi
      .getBlockedUsers()
      .then((list) => {
        if (!cancelled) setUsers(list);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUnblock = async (user: BlockedUser) => {
    const id = String(user.id);
    setBusyId(id);
    try {
      await messagesApi.unblockUser(id);
      setUsers((prev) => (prev ? prev.filter((u) => String(u.id) !== id) : prev));
      toast.success(t("settings.account.blockedUsers.unblocked", { name: user.name }));
    } catch {
      toast.error(t("settings.account.blockedUsers.unblockFailed"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card testID="blocked-users">
      <CardHeader>
        <CardTitle>{t("settings.account.blockedUsers.title")}</CardTitle>
        <Text className="text-sm text-muted-foreground">
          {t("settings.account.blockedUsers.description")}
        </Text>
      </CardHeader>
      <CardContent className="gap-2">
        {failed ? (
          <Text className="text-sm text-destructive">
            {t("settings.account.blockedUsers.loadFailed")}
          </Text>
        ) : users === null ? (
          <ActivityIndicator color={lightTheme.mutedForeground} />
        ) : users.length === 0 ? (
          <Text testID="blocked-users-empty" className="text-sm text-muted-foreground">
            {t("settings.account.blockedUsers.empty")}
          </Text>
        ) : (
          users.map((user) => (
            <View
              key={String(user.id)}
              testID={`blocked-user-${user.id}`}
              className="flex-row items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <Text className="flex-1 text-base">{user.name}</Text>
              <Button
                size="sm"
                variant="outline"
                testID={`blocked-user-unblock-${user.id}`}
                accessibilityLabel={t("settings.account.blockedUsers.unblock")}
                disabled={busyId === String(user.id)}
                onPress={() => void handleUnblock(user)}
              >
                <Text>{t("settings.account.blockedUsers.unblock")}</Text>
              </Button>
            </View>
          ))
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Account pane: the hosted legal pages plus in-app account deletion.
 *
 * Both are App Store 5.1.1 requirements and both were previously loose cards
 * on the flat settings screen. Web keeps legal links inside the Account tab
 * too, so they live here — in ONE place, not duplicated on the section list,
 * and their original testIDs (settings-legal / settings-privacy-policy /
 * settings-terms / settings-account) are preserved on the same elements.
 */
export function AccountSection() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isCoach = user?.roles?.includes("coach") ?? false;

  return (
    <View className="gap-4">
      {!isCoach ? (
        /* players.claim rule 4: the second place a student answers a coach's
           link request (the first is the dashboard banner). */
        <ClaimRequests variant="list" />
      ) : null}
      {!isCoach ? (
        /* players.join-token rule 8: Settings → Account is one of the three
           ways a student reaches "Connect with a coach". */
        <Card testID="settings-connect-coach-card">
          <CardContent className="pt-4">
            <Pressable
              testID="settings-connect-coach"
              accessibilityRole="button"
              accessibilityLabel={t("players.connect.settingsLink")}
              onPress={() => router.push("/connect")}
              className="flex-row items-center justify-between rounded-lg border border-border p-3 active:bg-accent"
            >
              <Text className="flex-1 text-base">{t("players.connect.settingsLink")}</Text>
              <Ionicons name="chevron-forward" size={18} color={lightTheme.mutedForeground} />
            </Pressable>
          </CardContent>
        </Card>
      ) : null}
      <Card testID="settings-legal">
        <CardHeader>
          <CardTitle>{t("settings.legal.title")}</CardTitle>
        </CardHeader>
        <CardContent className="gap-2">
          <LegalLinkRow
            testID="settings-privacy-policy"
            label={t("settings.legal.privacyPolicy")}
            url={PRIVACY_POLICY_URL}
          />
          <LegalLinkRow
            testID="settings-terms"
            label={t("settings.legal.termsOfService")}
            url={TERMS_URL}
          />
        </CardContent>
      </Card>

      <BlockedUsersCard />

      <DeleteAccountSection />
    </View>
  );
}
