import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import Constants from "expo-constants";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { Text } from "@/components/ui/text";
import { describeApiTarget, showsTestServerNotice } from "@/lib/api-target";
import { API_URL } from "@/lib/config";

/**
 * Which build this is and which server it talks to (PAD-351,
 * `mobile.release-build-target` rules 6-7). TestFlight builds 12 and 14-22
 * talked to staging, whose data is replaced by a copy of production on every
 * staging deploy, and nothing on screen said so.
 */

function versionLabel(): string {
  const config = Constants.expoConfig;
  const version = config?.version ?? "?";
  const build =
    Platform.OS === "android"
      ? config?.android?.versionCode?.toString()
      : config?.ios?.buildNumber;
  return build ? `${version} (${build})` : version;
}

/** Rule 6: under the Settings section list, in every build. */
export function BuildInfoLine() {
  const { t } = useTranslation();
  const { host, isProduction } = describeApiTarget(API_URL);
  return (
    <View testID="settings-build-info" className="items-center gap-1 pt-2">
      <Text className="text-xs text-muted-foreground">
        {t("settings.buildInfo.line", { version: versionLabel(), host })}
      </Text>
      {!isProduction && (
        <Text
          testID="settings-build-info-test-server"
          className="rounded-md border border-amber-300/60 bg-amber-50 px-2 py-1 text-xs font-medium"
        >
          {t("settings.buildInfo.testServer", { host })}
        </Text>
      )}
    </View>
  );
}

/** Rule 7: on the sign-in screen, in a release build that is not production. */
export function TestServerNotice() {
  const { t } = useTranslation();
  if (!showsTestServerNotice(API_URL, __DEV__)) return null;
  const { host } = describeApiTarget(API_URL);
  return (
    <View
      testID="login-test-server-notice"
      accessibilityRole="alert"
      className="mb-3 flex-row items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-3"
    >
      <Ionicons name="flask-outline" size={18} color={lightTheme.mutedForeground} />
      <Text className="flex-1 text-sm">
        {t("settings.buildInfo.loginNotice", { host })}
      </Text>
    </View>
  );
}
