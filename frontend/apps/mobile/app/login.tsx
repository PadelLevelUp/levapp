import { getApi } from "@levelup/api";
import { loginSchema } from "@levelup/validation";
import { router } from "expo-router";
import * as React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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

type FieldErrors = { username?: string; password?: string };

export default function LoginScreen() {
  const { login } = useAuth();
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
      router.replace("/(tabs)/dashboard");
    } catch (err: any) {
      // No `response` means the request never got a reply from the server —
      // network failure, timeout, DNS/connection error, wrong API host,
      // etc. Distinguish that from an actual auth rejection (401) so a
      // misconfigured/unreachable API doesn't masquerade as bad credentials
      // (see 2026-07-24 App Store rejection: "Could not sign in" screenshot
      // was actually a build pointed at an unreachable API URL).
      const message =
        err?.response?.data?.message ??
        err?.response?.data?.error ??
        (!err?.response
          ? "Could not connect to the server. Check your connection."
          : err.response.status === 401
            ? "Invalid username or password."
            : "Could not sign in. Please try again.");
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
          <View className="mb-3 flex-row items-center gap-2.5" testID="login-brand">
            <LevAppMark size={40} />
            <Text className="font-display text-4xl text-sidebar-foreground">
              Lev<Text className="font-display text-4xl text-primary">App</Text>
            </Text>
          </View>
          <Text className="mt-1 text-sm text-sidebar-foreground opacity-70">
            Padel coaching platform
          </Text>
        </View>

        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-center">Sign In</CardTitle>
            <CardDescription className="text-center">
              Enter your credentials to access the platform
            </CardDescription>
          </CardHeader>

          <CardContent className="gap-4">
            <View className="gap-1.5">
              <Label testID="login-username-label">Username</Label>
              <Input
                testID="login-username"
                accessibilityLabel="Username"
                placeholder="Enter your username"
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
              <Label testID="login-password-label">Password</Label>
              <Input
                testID="login-password"
                accessibilityLabel="Password"
                placeholder="Enter your password"
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
              accessibilityLabel="Sign in"
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text>Sign In</Text>
              )}
            </Button>
          </CardContent>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
