import { d314Tag } from "@/lib/d314-tag";
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
    <View ref={d314Tag("c.root")} className="flex-1 justify-center bg-sidebar p-4">
      <View ref={d314Tag("c.markWrap")} className="mb-6 items-center">
        <LevAppMark size={30} />
      </View>
      <Card ref={d314Tag("c.card")} testID="connect-with-coach">
        <CardHeader ref={d314Tag("c.header")} className="items-center">
          <View ref={d314Tag("c.iconWrap")} className="mb-2 h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Ionicons name="qr-code-outline" size={24} color={lightTheme.primary} />
          </View>
          <CardTitle ref={d314Tag("c.title")} className="text-center">{t("players.connect.title")}</CardTitle>
          <CardDescription ref={d314Tag("c.desc")} className="text-center">{t("players.connect.description")}</CardDescription>
        </CardHeader>
        <CardContent ref={d314Tag("c.content")} className="gap-3">
          <Text ref={d314Tag("c.pasteLabel")} className="text-sm font-medium">{t("players.connect.pasteLabel")}</Text>
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
          <Button ref={d314Tag("c.goBtn")} testID="connect-paste-go" onPress={handleGo}>
            <Text ref={d314Tag("c.goText")}>{t("players.connect.go")}</Text>
          </Button>
          <Text ref={d314Tag("c.stepWait")} className="text-sm text-muted-foreground">{t("players.connect.stepWait")}</Text>
          <Button
            variant="outline"
            ref={d314Tag("c.dashBtn")}
            testID="connect-go-dashboard"
            onPress={() => router.replace("/(tabs)/dashboard")}
          >
            <Text ref={d314Tag("c.dashText")}>{t("players.connect.goToDashboard")}</Text>
          </Button>
        </CardContent>
      </Card>
    </View>
  );
}
