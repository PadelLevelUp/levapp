import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
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

/**
 * clubs.join-request rule 7 — an approved coach with no club picks one here.
 * Slice A placeholder; slice B (PAD-211) builds the real screen.
 */
export default function ClubOnboardingScreen() {
  const { t } = useTranslation();
  const { logout } = useAuth();

  return (
    <View className="flex-1 justify-center bg-sidebar p-4">
      <View className="mb-6 items-center">
        <LevAppMark size={30} />
      </View>
      <Card testID="club-onboarding">
        <CardHeader className="items-center">
          <View className="mb-2 h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Ionicons name="business-outline" size={24} color={lightTheme.primary} />
          </View>
          <CardTitle className="text-center">{t("auth.clubOnboarding.title")}</CardTitle>
          <CardDescription className="text-center">{t("auth.clubOnboarding.description")}</CardDescription>
        </CardHeader>
        <CardContent className="gap-3">
          <Text className="text-sm text-muted-foreground">{t("auth.clubOnboarding.comingSoon")}</Text>
          <Button variant="ghost" onPress={() => void logout()}>
            <Text>{t("auth.coachPending.signOut")}</Text>
          </Button>
        </CardContent>
      </Card>
    </View>
  );
}
