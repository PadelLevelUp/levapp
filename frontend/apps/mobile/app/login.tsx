import { getApi } from "@levelup/api";
import { loginSchema } from "@levelup/validation";
import { router } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { postLoginLanding } from "@/auth/postLoginRoute";
import { consumePendingJoin } from "@/auth/pendingJoin";
import { consumePendingClaim } from "@/auth/pendingClaim";
import { LegalLinks } from "@/features/auth/LegalLinks";

type FieldErrors = { username?: string; password?: string };

export default function LoginScreen() {
  const { t } = useTranslation();
  const { login, refreshUser } = useAuth();
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const validate = (): boolean => {
    const result = loginSchema.safeParse({ username, password });
    if (result.success) {
      setErrors({});
      return true;
    }
    const next: FieldErrors = {};
    for (const issue of result.error.errors) {
      const field = issue.path[0] as keyof FieldErrors;
      if (!next[field]) next[field] = issue.message;
    }
    setErrors(next);
    return false;
  };

  const handleLogin = async () => {
    setFormError(null);
    if (!validate()) return;

    setLoading(true);
    try {
      const res = await getApi().post("/auth/login", { username, password });
      await login(res.data.accessToken);
      // auth.register rule 11: route by approval / club state, not straight
      // to the tabs.
      // players.join-token rule 9: a join link opened without a session comes
      // first, once the account is one that can use it.
      const route = postLoginLanding(await refreshUser());
      const pending = consumePendingJoin();
      // players.claim rule 3: an invite link opened to LINK an existing account.
      const pendingClaim = consumePendingClaim();
      if (pendingClaim && (route === "/(tabs)/dashboard" || route === "/connect")) {
        router.replace(`/invite/player/${pendingClaim}`);
        return;
      }
      router.replace(pending && (route === "/(tabs)/dashboard" || route === "/connect") ? `/join/coach/${pending}` : route);
    } catch (err: any) {
      // No `response` means the request never got a reply from the server —
      // network failure, timeout, DNS/connection error, wrong API host,
      // etc. Distinguish that from an actual auth rejection (401) so a
      // misconfigured/unreachable API doesn't masquerade as bad credentials
      // (see 2026-07-24 App Store rejection: "Could not sign in" screenshot
      // was actually a build pointed at an unreachable API URL).
      // auth.login rule 7 (PAD-228): a throttled attempt says when to retry.
      const message =
        err?.response?.status === 429
          ? t("auth.login.rateLimited", { seconds: err.response?.data?.retryAfterSeconds ?? 60 })
          : err?.response?.data?.message ??
        err?.response?.data?.error ??
        (!err?.response
          ? t("auth.login.networkError")
          : err.response.status === 401
            ? t("auth.login.failedDescription")
            : t("auth.login.genericError"));
      setFormError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-sidebar"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerClassName="flex-grow justify-center p-4"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View className="mb-8 items-center">
          {/* The mark, not a hand-typed wordmark. This screen still spelled
              "LevelUp" in live text with a hardcoded blue split — it predates
              the rebrand and was the only place the old name survived on a
              screen a user actually sees. */}
          <View className="mb-3 flex-row items-center gap-3" testID="login-brand">
            {/* The mark is sized to the wordmark's CAP HEIGHT, not to its line
                box: Poppins caps are ~0.70em, so a 36px type size gives ~25px
                of cap. Matching the mark to that, with a 1px optical nudge for
                the A's pointed apex, seats the two on the same visual line —
                `items-center` alone only centres their bounding boxes, which
                is what made it look off. */}
            <LevAppMark size={30} />
            <Text
              className="font-display text-sidebar-foreground"
              style={{ fontSize: 36, lineHeight: 40 }}
            >
              Lev
              <Text className="font-display text-primary" style={{ fontSize: 36, lineHeight: 40 }}>
                App
              </Text>
            </Text>
          </View>
          <Text className="mt-1 text-sm text-sidebar-foreground opacity-70">
            {t("auth.login.tagline")}
          </Text>
        </View>

        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-center">{t("auth.login.title")}</CardTitle>
            <CardDescription className="text-center">
              {t("auth.login.description")}
            </CardDescription>
          </CardHeader>

          <CardContent className="gap-4">
            <View className="gap-1.5">
              <Label testID="login-username-label">{t("auth.login.username")}</Label>
              <Input
                testID="login-username"
                accessibilityLabel={t("auth.login.username")}
                placeholder={t("auth.login.usernameInputPlaceholder")}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                value={username}
                onChangeText={setUsername}
                editable={!loading}
              />
              {errors.username ? (
                <Text
                  className="text-sm text-destructive"
                  testID="login-username-error"
                >
                  {errors.username}
                </Text>
              ) : null}
            </View>

            <View className="gap-1.5">
              <Label testID="login-password-label">{t("auth.login.password")}</Label>
              <Input
                testID="login-password"
                accessibilityLabel={t("auth.login.password")}
                placeholder={t("auth.login.passwordInputPlaceholder")}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="password"
                value={password}
                onChangeText={setPassword}
                editable={!loading}
              />
              {errors.password ? (
                <Text
                  className="text-sm text-destructive"
                  testID="login-password-error"
                >
                  {errors.password}
                </Text>
              ) : null}
            </View>

            {formError ? (
              <Text
                className="text-center text-sm text-destructive"
                testID="login-error"
              >
                {formError}
              </Text>
            ) : null}

            <Button
              testID="login-submit"
              accessibilityLabel={t("auth.login.signIn")}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text>{t("auth.login.signIn")}</Text>
              )}
            </Button>

            {/* auth.login rule 6 / auth.password-recovery rule 7 — the recovery entry point. */}
            <Pressable
              testID="login-forgot-password"
              accessibilityRole="link"
              accessibilityLabel={t("auth.login.forgotPassword")}
              onPress={() => router.push("/forgot-password")}
              disabled={loading}
              className="items-center"
            >
              <Text className="text-sm text-muted-foreground underline">{t("auth.login.forgotPassword")}</Text>
            </Pressable>

            {/* auth.register rule 10 — the signup entry point lives on the login screen. */}
            <View className="flex-row items-center justify-center gap-1 pt-1">
              <Text className="text-sm text-muted-foreground">{t("auth.login.noAccount")}</Text>
              <Pressable
                testID="login-create-account"
                accessibilityRole="link"
                accessibilityLabel={t("auth.login.createAccount")}
                onPress={() => router.push("/signup")}
                disabled={loading}
              >
                <Text className="text-sm font-medium text-primary underline">
                  {t("auth.login.createAccount")}
                </Text>
              </Pressable>
            </View>
          </CardContent>
        </Card>

        {/* Web's sign-in page carries these under the card; mobile had them
            only inside Settings, i.e. behind the very sign-in a new user has
            not completed yet (PAD-164). */}
        <LegalLinks testID="login-legal" />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
