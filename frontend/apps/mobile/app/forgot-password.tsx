import { Ionicons } from "@expo/vector-icons";
import { authApi } from "@levelup/api";
import { lightTheme } from "@levelup/config";
import { router } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { postLoginLanding } from "@/auth/postLoginRoute";
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
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/**
 * auth.password-recovery rule 8 — the two-step recovery screen reached from
 * "Forgot your password?" on the login screen, mirroring web's
 * ForgotPasswordPage. Step 1 asks for the account email and ALWAYS moves on
 * with neutral copy (the server never says whether the email has an
 * account). Step 2 takes the mailed 6-digit code (one invisible TextInput
 * over six drawn cells, as verify-email.tsx) and a new password, and signs
 * the person in exactly as a fresh login would.
 */
const CODE_LENGTH = 6;
const PASSWORD_MIN = 8;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type ErrData = { error?: string; attemptsLeft?: number; retryAfterSeconds?: number };
type ApiErr = { response?: { status?: number; data?: ErrData } };

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const { login, refreshUser } = useAuth();

  const [email, setEmail] = React.useState("");
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [step, setStep] = React.useState<"email" | "code">("email");
  const [countdown, setCountdown] = React.useState(0);

  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [codeError, setCodeError] = React.useState<string | null>(null);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const codeRef = React.useRef<TextInput>(null);

  React.useEffect(() => {
    if (countdown <= 0) return;
    const id = setInterval(() => setCountdown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [countdown]);

  const send = React.useCallback(async () => {
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setEmailError(t("auth.recovery.invalidEmail"));
      return;
    }
    setSending(true);
    setEmailError(null);
    setCodeError(null);
    try {
      const res = await authApi.requestPasswordRecovery(value);
      setCountdown(res.resendAvailableInSeconds);
      setCode("");
      setStep("code");
    } catch (err) {
      const res = (err as ApiErr).response;
      setEmailError(
        res?.status === 429
          ? t("auth.login.rateLimited", { seconds: res.data?.retryAfterSeconds ?? 60 })
          : res?.status === 400
            ? t("auth.recovery.invalidEmail")
            : t("auth.login.networkError")
      );
    } finally {
      setSending(false);
    }
  }, [email, t]);

  const submit = async () => {
    if (submitting) return;
    let bad = false;
    if (password.length < PASSWORD_MIN) {
      setPasswordError(t("auth.recovery.weakPassword", { count: PASSWORD_MIN }));
      bad = true;
    }
    if (code.length !== CODE_LENGTH) {
      setCodeError(t("auth.recovery.codeIncomplete"));
      bad = true;
    }
    if (bad) return;
    setSubmitting(true);
    setCodeError(null);
    setPasswordError(null);
    try {
      const res = await authApi.confirmPasswordRecovery({ email: email.trim(), code, newPassword: password });
      await login(res.accessToken);
      const route = postLoginLanding(await refreshUser());
      toast.success(t("auth.recovery.changedTitle"));
      router.replace(route as never);
    } catch (err) {
      const status = (err as ApiErr).response?.status;
      const data = (err as ApiErr).response?.data;
      if (status === 400 && data?.error === "WEAK_PASSWORD") {
        setPasswordError(t("auth.recovery.weakPassword", { count: PASSWORD_MIN }));
      } else if (status === 400 && data?.error === "INVALID_CODE") {
        const left = data.attemptsLeft ?? 0;
        setCode("");
        setCodeError(
          left > 0 ? t("auth.verifyEmail.invalidCode", { count: left }) : t("auth.verifyEmail.invalidCodeLocked")
        );
      } else if (status === 410) {
        setCode("");
        setCodeError(t("auth.verifyEmail.expired"));
      } else if (status === 429) {
        // auth.password-recovery rule 10 (PAD-228).
        setCodeError(t("auth.login.rateLimited", { seconds: data?.retryAfterSeconds ?? 60 }));
      } else {
        setCodeError(t("auth.login.networkError"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onChangeCode = (raw: string) => {
    // A pasted "123 456" or an autofilled code both collapse to the digits.
    const digits = raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    if (codeError) setCodeError(null);
  };

  const activeIndex = Math.min(code.length, CODE_LENGTH - 1);

  return (
    <KeyboardAvoidingView className="flex-1 bg-sidebar" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerClassName="flex-grow justify-center p-4"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View className="mb-6 items-center">
          <LevAppMark size={30} />
        </View>

        <Card testID="screen-forgot-password">
          <CardHeader className="items-center">
            <View className="mb-2 h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Ionicons name="key-outline" size={24} color={lightTheme.primary} />
            </View>
            <CardTitle className="text-center">{t("auth.recovery.title")}</CardTitle>
            <CardDescription className="text-center">
              {step === "email" ? t("auth.recovery.description") : t("auth.recovery.codeDescription")}
            </CardDescription>
          </CardHeader>

          <CardContent className="gap-4">
            {step === "email" ? (
              <View className="gap-4" testID="recovery-email-step">
                <View className="gap-1.5">
                  <Label>{t("auth.recovery.email")}</Label>
                  <Input
                    testID="recovery-email"
                    accessibilityLabel={t("auth.recovery.email")}
                    placeholder={t("auth.recovery.emailPlaceholder")}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    autoFocus
                    value={email}
                    onChangeText={(v) => {
                      setEmail(v);
                      setEmailError(null);
                    }}
                    onSubmitEditing={() => void send()}
                    editable={!sending}
                    className={emailError ? "border-destructive" : undefined}
                  />
                  {emailError ? (
                    <Text className="text-sm text-destructive" testID="recovery-email-error" accessibilityLiveRegion="polite">
                      {emailError}
                    </Text>
                  ) : null}
                </View>
                <Button testID="recovery-send" accessibilityLabel={t("auth.recovery.send")} onPress={() => void send()} disabled={sending}>
                  {sending ? <ActivityIndicator color="#ffffff" /> : <Text>{t("auth.recovery.send")}</Text>}
                </Button>
              </View>
            ) : (
              <View className="gap-4" testID="recovery-code-step">
                <Text className="text-center text-sm text-muted-foreground" testID="recovery-neutral-copy">
                  {t("auth.recovery.neutral", { email: email.trim() })}
                </Text>

                <Pressable
                  accessibilityRole="none"
                  accessibilityLabel={t("auth.recovery.codeLabel")}
                  onPress={() => codeRef.current?.focus()}
                  className="items-center"
                >
                  <View className="flex-row justify-center gap-2">
                    {Array.from({ length: CODE_LENGTH }).map((_, i) => {
                      const active = focused && i === activeIndex && !submitting;
                      return (
                        <View
                          key={i}
                          testID={`recovery-cell-${i}`}
                          className={cn(
                            "h-14 w-11 items-center justify-center rounded-lg border bg-background",
                            active ? "border-primary" : "border-border",
                            submitting && "opacity-50"
                          )}
                        >
                          <Text className="text-2xl font-semibold text-foreground tabular-nums">{code[i] ?? ""}</Text>
                        </View>
                      );
                    })}
                  </View>
                  {/* The real input: full-size over the cells, invisible, so a
                      tap anywhere on them focuses it and autofill lands here. */}
                  <TextInput
                    ref={codeRef}
                    testID="recovery-code"
                    accessibilityLabel={t("auth.recovery.codeLabel")}
                    value={code}
                    onChangeText={onChangeCode}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    autoComplete="one-time-code"
                    maxLength={CODE_LENGTH}
                    autoFocus
                    caretHidden
                    editable={!submitting}
                    style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, opacity: 0.02, color: "transparent" }}
                  />
                </Pressable>
                <Text
                  className={cn("text-center text-sm", codeError ? "text-destructive" : "text-muted-foreground")}
                  accessibilityLiveRegion="polite"
                  testID={codeError ? "recovery-error" : "recovery-hint"}
                >
                  {codeError ?? t("auth.recovery.hint")}
                </Text>

                <View className="gap-1.5">
                  <Label>{t("auth.recovery.newPassword")}</Label>
                  <Input
                    testID="recovery-password"
                    accessibilityLabel={t("auth.recovery.newPassword")}
                    placeholder={t("auth.login.passwordInputPlaceholder")}
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete="new-password"
                    value={password}
                    onChangeText={(v) => {
                      setPassword(v);
                      setPasswordError(null);
                    }}
                    editable={!submitting}
                    className={passwordError ? "border-destructive" : undefined}
                  />
                  {passwordError ? (
                    <Text className="text-sm text-destructive" testID="recovery-password-error" accessibilityLiveRegion="polite">
                      {passwordError}
                    </Text>
                  ) : null}
                </View>

                <Button testID="recovery-submit" accessibilityLabel={t("auth.recovery.submit")} onPress={() => void submit()} disabled={submitting}>
                  {submitting ? <ActivityIndicator color="#ffffff" /> : <Text>{t("auth.recovery.submit")}</Text>}
                </Button>

                <Button
                  variant="outline"
                  testID="recovery-resend"
                  disabled={countdown > 0 || sending}
                  onPress={() => void send()}
                >
                  <Text>
                    {countdown > 0 ? t("auth.verifyEmail.resendIn", { seconds: countdown }) : t("auth.verifyEmail.resend")}
                  </Text>
                </Button>
              </View>
            )}

            <Pressable
              testID="recovery-back"
              accessibilityRole="link"
              accessibilityLabel={t("auth.recovery.back")}
              onPress={() => (router.canGoBack() ? router.back() : router.replace("/login"))}
              className="items-center pt-1"
            >
              <Text className="text-sm text-muted-foreground underline">{t("auth.recovery.back")}</Text>
            </Pressable>
          </CardContent>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
