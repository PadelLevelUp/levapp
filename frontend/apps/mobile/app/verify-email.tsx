import { Ionicons } from "@expo/vector-icons";
import { authApi } from "@levelup/api";
import { lightTheme } from "@levelup/config";
import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import { keyboardAvoidingBehavior } from "@/lib/keyboard-avoiding";

/**
 * auth.email-verification rule 8 — the screen that holds a `pending` user
 * until the 6-digit code from their inbox is typed back, mirroring web's
 * VerifyEmailPage. One invisible TextInput sits over six drawn cells so the
 * numeric keypad and iOS's one-time-code autofill (the code offered above the
 * keyboard when the mail arrives) both land in it. `?next=` is where to go
 * once verified.
 */
const CODE_LENGTH = 6;

type ErrData = { error?: string; attemptsLeft?: number; retryAfterSeconds?: number };
type ApiErr = { response?: { status?: number; data?: ErrData } };

function safeNext(raw: string | string[] | undefined): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && value.startsWith("/") && !value.startsWith("//") ? value : null;
}

export default function VerifyEmailScreen() {
  const { t } = useTranslation();
  const { user, logout, refreshUser } = useAuth();
  const params = useLocalSearchParams<{ next?: string }>();
  const next = safeNext(params.next);

  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  // Neutral text for the hint slot (rule 8b: "no code in the clipboard") —
  // never the red error slot.
  const [notice, setNotice] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [countdown, setCountdown] = React.useState<number>(user?.emailVerificationResendInSeconds ?? 60);
  const [editing, setEditing] = React.useState(false);
  const [newEmail, setNewEmail] = React.useState("");
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [savingEmail, setSavingEmail] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const inputRef = React.useRef<TextInput>(null);
  const autoSent = React.useRef(false);

  const email = user?.email ?? "";

  const leave = React.useCallback(
    (me: authApi.MeResponse | null | undefined = user) => {
      router.replace((next ?? postLoginLanding(me)) as never);
    },
    [next, user]
  );

  React.useEffect(() => {
    if (countdown <= 0) return;
    const id = setInterval(() => setCountdown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [countdown]);

  const send = React.useCallback(async () => {
    setSending(true);
    setError(null);
    try {
      const res = await authApi.sendEmailVerificationCode();
      setCountdown(res.resendAvailableInSeconds);
      setCode("");
      toast.success(t("auth.verifyEmail.sent"));
    } catch (err) {
      const status = (err as ApiErr).response?.status;
      const data = (err as ApiErr).response?.data;
      if (status === 429 && data?.retryAfterSeconds) {
        // Rule 8a / B-042: "too soon" means a code is already in the inbox.
        // The counting-down button says so; nothing turns red.
        setCountdown(data.retryAfterSeconds);
      } else if (status === 409) {
        void refreshUser().then((me) => leave(me ?? user));
      } else {
        setError(t("auth.verifyEmail.mailFailed"));
      }
    } finally {
      setSending(false);
    }
  }, [leave, refreshUser, t, user]);

  // Already verified: nothing to do. Never asked (Settings → Verify): request
  // the first code now. A `pending` user is NOT asked again — signup and a
  // Settings email change already sent one (rule 8a); the countdown seeded
  // from /me above is the whole story.
  React.useEffect(() => {
    if (!user) return;
    if (user.emailVerification === "verified" || !user.email) {
      leave();
      return;
    }
    if (user.emailVerification !== "pending" && !autoSent.current) {
      autoSent.current = true;
      setCountdown(0);
      void send();
    }
  }, [user, leave, send]);

  const submit = React.useCallback(
    async (value: string) => {
      if (value.length !== CODE_LENGTH || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        const me = await authApi.confirmEmailVerificationCode(value);
        await refreshUser();
        toast.success(t("auth.verifyEmail.verified"));
        leave(me);
      } catch (err) {
        const status = (err as ApiErr).response?.status;
        const data = (err as ApiErr).response?.data;
        setCode("");
        if (status === 400 && data?.error === "INVALID_CODE") {
          const left = data.attemptsLeft ?? 0;
          setError(
            left > 0 ? t("auth.verifyEmail.invalidCode", { count: left }) : t("auth.verifyEmail.invalidCodeLocked")
          );
        } else if (status === 410) {
          setError(t("auth.verifyEmail.expired"));
        } else if (status === 429) {
          // auth.email-verification rule 13 (PAD-269): the per-IP throttle.
          const retry = (data as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds ?? 60;
          setError(t("auth.login.rateLimited", { seconds: retry }));
        } else {
          setError(t("auth.login.networkError"));
        }
      } finally {
        setSubmitting(false);
      }
    },
    [leave, refreshUser, submitting, t]
  );

  const onChangeCode = (raw: string) => {
    // A pasted "123 456" or an autofilled code both collapse to the digits.
    const digits = raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    if (error) setError(null);
    if (notice) setNotice(null);
    if (digits.length === CODE_LENGTH) void submit(digits);
  };

  // Rule 8b / B-044 (PAD-251): the real input is an invisible overlay, so iOS
  // has no caret or selection to hang its Paste callout on, and the number
  // pad has no paste key. This button reads the clipboard itself.
  const paste = async () => {
    // expo-clipboard is a native module; load it lazily so a binary built
    // before it was linked fails at the tap with a toast, not at route load
    // (same shape as the message copy action in conversation/[id].tsx).
    let clipboard: typeof import("expo-clipboard");
    try {
      clipboard = require("expo-clipboard");
    } catch {
      toast.error(t("auth.login.networkError"));
      return;
    }
    let text = "";
    try {
      text = await clipboard.getStringAsync();
    } catch {
      text = "";
    }
    // The mail renders the code as one token, but a person may have selected
    // "O teu código LevApp: 166315" — take the first run of six digits.
    const match = text.match(/\d{6}/);
    if (!match) {
      // The hint slot shows `error ?? notice`; a stale wrong-code error would
      // hide the notice, so clear it — the person just asked for something new.
      setError(null);
      setCode("");
      setNotice(t("auth.verifyEmail.pasteEmpty"));
      return;
    }
    setNotice(null);
    onChangeCode(match[0]);
  };

  const saveEmail = async () => {
    const value = newEmail.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      setEmailError(t("auth.signup.emailInvalid"));
      return;
    }
    setSavingEmail(true);
    setEmailError(null);
    try {
      // settings.profile rule 9: a new address gets its own code server-side.
      const me = await authApi.updateMe({ email: value });
      await refreshUser();
      setEditing(false);
      setNewEmail("");
      setCode("");
      setError(null);
      setCountdown(me.emailVerificationResendInSeconds ?? 60);
      toast.success(t("auth.verifyEmail.sent"));
    } catch (err) {
      const status = (err as ApiErr).response?.status;
      setEmailError(status === 409 ? t("auth.signup.emailTaken") : t("auth.signup.emailInvalid"));
    } finally {
      setSavingEmail(false);
    }
  };

  const activeIndex = Math.min(code.length, CODE_LENGTH - 1);

  return (
    <KeyboardAvoidingView className="flex-1 bg-sidebar" behavior={keyboardAvoidingBehavior()}>
      <ScrollView
        contentContainerClassName="flex-grow justify-center p-4"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View className="mb-6 items-center">
          <LevAppMark size={30} />
        </View>

        <Card testID="verify-email">
          <CardHeader className="items-center">
            <View className="mb-2 h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Ionicons name="mail-open-outline" size={24} color={lightTheme.primary} />
            </View>
            <CardTitle className="text-center">{t("auth.verifyEmail.title")}</CardTitle>
            <CardDescription className="text-center">
              {t("auth.verifyEmail.description")}{" "}
              <Text className="text-sm font-medium text-foreground" testID="verify-email-address">
                {email}
              </Text>
            </CardDescription>
          </CardHeader>

          <CardContent className="gap-4">
            {editing ? (
              <View className="gap-1.5" testID="verify-email-edit">
                <Label>{t("auth.verifyEmail.newEmail")}</Label>
                <Input
                  testID="verify-email-new-address"
                  accessibilityLabel={t("auth.verifyEmail.newEmail")}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  autoFocus
                  value={newEmail}
                  onChangeText={(v) => {
                    setNewEmail(v);
                    setEmailError(null);
                  }}
                  editable={!savingEmail}
                  className={emailError ? "border-destructive" : undefined}
                />
                {emailError ? (
                  <Text className="text-sm text-destructive" testID="verify-email-new-error" accessibilityLiveRegion="polite">
                    {emailError}
                  </Text>
                ) : null}
                <View className="mt-2 flex-row gap-2">
                  <Button
                    className="flex-1"
                    testID="verify-email-save-address"
                    disabled={savingEmail}
                    onPress={() => void saveEmail()}
                  >
                    {savingEmail ? <ActivityIndicator color="#ffffff" /> : <Text>{t("auth.verifyEmail.saveEmail")}</Text>}
                  </Button>
                  <Button variant="outline" disabled={savingEmail} onPress={() => setEditing(false)}>
                    <Text>{t("common.cancel")}</Text>
                  </Button>
                </View>
              </View>
            ) : (
              <>
                <Pressable
                  accessibilityRole="none"
                  accessibilityLabel={t("auth.verifyEmail.codeLabel")}
                  onPress={() => inputRef.current?.focus()}
                  className="items-center"
                >
                  <View className="flex-row justify-center gap-2">
                    {Array.from({ length: CODE_LENGTH }).map((_, i) => {
                      const active = focused && i === activeIndex && !submitting;
                      return (
                        <View
                          key={i}
                          testID={`verify-email-cell-${i}`}
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
                    ref={inputRef}
                    testID="verify-email-code"
                    accessibilityLabel={t("auth.verifyEmail.codeLabel")}
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
                  className={cn("text-center text-sm", error ? "text-destructive" : "text-muted-foreground")}
                  accessibilityLiveRegion="polite"
                  testID={error ? "verify-email-error" : "verify-email-hint"}
                >
                  {error ?? notice ?? (submitting ? t("auth.verifyEmail.verifying") : t("auth.verifyEmail.hint"))}
                </Text>

                <Button
                  variant="outline"
                  testID="verify-email-paste"
                  accessibilityLabel={t("auth.verifyEmail.pasteCode")}
                  disabled={submitting}
                  onPress={() => void paste()}
                >
                  <Ionicons name="clipboard-outline" size={18} color={lightTheme.primary} />
                  <Text>{t("auth.verifyEmail.pasteCode")}</Text>
                </Button>

                <Button
                  variant="outline"
                  testID="verify-email-resend"
                  disabled={countdown > 0 || sending}
                  onPress={() => void send()}
                >
                  <Text>
                    {countdown > 0 ? t("auth.verifyEmail.resendIn", { seconds: countdown }) : t("auth.verifyEmail.resend")}
                  </Text>
                </Button>
                <Button
                  variant="ghost"
                  testID="verify-email-change"
                  onPress={() => {
                    setNewEmail(email);
                    setEditing(true);
                  }}
                >
                  <Text>{t("auth.verifyEmail.changeEmail")}</Text>
                </Button>
              </>
            )}

            <Button variant="ghost" testID="verify-email-signout" onPress={() => void logout()}>
              <Text className="text-muted-foreground">{t("auth.verifyEmail.signOut")}</Text>
            </Button>
          </CardContent>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
