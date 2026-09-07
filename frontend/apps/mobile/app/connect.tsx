import { Ionicons } from "@expo/vector-icons";
import { joinTokensApi } from "@levelup/api";
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
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";

/**
 * players.join-token rule 8 — "Connect with a coach" on iOS. No in-app
 * scanner (rule 10): the camera app opens the universal link. Here the
 * student can paste the link a coach sent them instead.
 */
export default function ConnectScreen() {
  const { t } = useTranslation();
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const handleGo = () => {
    const token = joinTokensApi.joinTokenFromInput(value);
    if (!token) {
      setError(t("players.connect.invalidLink"));
      return;
    }
    router.push(`/join/coach/${token}`);
  };

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
          <CardTitle className="text-center">{t("players.connect.title")}</CardTitle>
          <CardDescription className="text-center">{t("players.connect.description")}</CardDescription>
        </CardHeader>
        <CardContent className="gap-3">
          <Text className="text-sm font-medium">{t("players.connect.pasteLabel")}</Text>
          <Input
            testID="connect-paste-input"
            placeholder={t("players.connect.pastePlaceholder")}
            value={value}
            onChangeText={(v) => {
              setValue(v);
              setError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={handleGo}
          />
          {error ? (
            <Text className="text-sm text-destructive" testID="connect-paste-error">
              {error}
            </Text>
          ) : null}
          <Button testID="connect-paste-go" onPress={handleGo}>
            <Text>{t("players.connect.go")}</Text>
          </Button>
          <Text className="text-sm text-muted-foreground">{t("players.connect.stepWait")}</Text>
          <Button
            variant="outline"
            testID="connect-go-dashboard"
            onPress={() => router.replace("/(tabs)/dashboard")}
          >
            <Text>{t("players.connect.goToDashboard")}</Text>
          </Button>
        </CardContent>
      </Card>
    </View>
  );
}
