import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import { router } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
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
 * players.join-token rule 8 — "Connect with a coach", the student's first
 * screen after signup. Slice A placeholder; slice C (PAD-212) adds the
 * paste-link field and the join flow.
 */
export default function ConnectScreen() {
  const { t } = useTranslation();

  return (
    <View className="flex-1 justify-center bg-sidebar p-4">
      <View className="mb-6 items-center">
        <LevAppMark size={30} />
      </View>
      <Card testID="connect-with-coach">
        <CardHeader className="items-center">
          <View className="mb-2 h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Ionicons name="qr-code-outline" size={24} color={lightTheme.primary} />
          </View>
          <CardTitle className="text-center">{t("auth.connect.title")}</CardTitle>
          <CardDescription className="text-center">{t("auth.connect.description")}</CardDescription>
        </CardHeader>
        <CardContent className="gap-3">
          <Text className="text-sm text-muted-foreground">1. {t("auth.connect.stepScan")}</Text>
          <Text className="text-sm text-muted-foreground">2. {t("auth.connect.stepWait")}</Text>
          <Button
            variant="outline"
            testID="connect-go-dashboard"
            onPress={() => router.replace("/(tabs)/dashboard")}
          >
            <Text>{t("auth.connect.goToDashboard")}</Text>
          </Button>
        </CardContent>
      </Card>
    </View>
  );
}
