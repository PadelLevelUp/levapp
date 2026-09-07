import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import { router, useFocusEffect } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Linking, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { postLoginRoute } from "@/auth/postLoginRoute";
import { LevAppMark } from "@/components/brand/LevAppMark";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { SUPPORT_URL } from "@/lib/config";

/**
 * auth.coach-approval rule 6 — the holding screens for a self-registered
 * coach: "waiting for LevApp approval" and "not approved". No club or roster
 * action is offered. Focusing the screen re-reads /auth/me so a coach approved
 * in the meantime moves on without signing out.
 */
export default function CoachPendingScreen() {
  const { t } = useTranslation();
  const { user, logout, refreshUser } = useAuth();

  useFocusEffect(
    React.useCallback(() => {
      let cancelled = false;
      void refreshUser().then((me) => {
        if (cancelled || !me) return;
        const route = postLoginRoute(me);
        if (route !== "/coach-pending") router.replace(route);
      });
      return () => {
        cancelled = true;
      };
    }, [refreshUser])
  );

  const rejected = user?.coachApproval === "rejected";

  return (
    <View className="flex-1 justify-center bg-sidebar p-4">
      <View className="mb-6 items-center">
        <LevAppMark size={30} />
      </View>
      <Card testID={rejected ? "coach-rejected" : "coach-pending"}>
        <CardHeader className="items-center">
          <View className="mb-2 h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Ionicons
              name={rejected ? "shield-outline" : "time-outline"}
              size={24}
              color={lightTheme.primary}
            />
          </View>
          <CardTitle className="text-center">
            {rejected ? t("auth.coachPending.rejectedTitle") : t("auth.coachPending.title")}
          </CardTitle>
          <CardDescription className="text-center">
            {rejected
              ? t("auth.coachPending.rejectedDescription")
              : t("auth.coachPending.description", { name: user?.name ?? "" })}
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-3">
          {!rejected ? (
            <Text className="text-sm text-muted-foreground">{t("auth.coachPending.whatNext")}</Text>
          ) : (
            <Button variant="outline" onPress={() => void Linking.openURL(SUPPORT_URL)}>
              <Text>{t("auth.coachPending.contactSupport")}</Text>
            </Button>
          )}
          <Button variant="ghost" testID="coach-pending-signout" onPress={() => void logout()}>
            <Text>{t("auth.coachPending.signOut")}</Text>
          </Button>
        </CardContent>
      </Card>
    </View>
  );
}
