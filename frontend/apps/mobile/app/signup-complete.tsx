import { authApi } from "@levelup/api";
import { COUNTRIES, countryName } from "@levelup/config";
import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Linking, Pressable, ScrollView, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useAuth } from "@/auth/AuthContext";
import { enterSession } from "@/auth/enterSession";
import { LevAppMark } from "@/components/brand/LevAppMark";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Text } from "@/components/ui/text";
import { describeApiError } from "@/lib/apiError";
import { PRIVACY_POLICY_URL, TERMS_URL, legalUrl } from "@/lib/config";
import { keyboardAvoidingBehavior } from "@/lib/keyboard-avoiding";
import { CODE_KEYS, formatBirthInput } from "@/features/auth/signup-form";
import { validateCompletion, type CompleteErrors, type CompleteField } from "@/features/auth/social-complete-form";

type Role = "coach" | "student";

/**
 * auth.social-sign-in rules 4 and 7 (PAD-618): the short completion step for a person whose
 * Google or Apple account has no LevApp account yet. The ticket arrives as a route param; nothing
 * is stored until they submit. On success the session is entered exactly as after a password login.
 */
export default function SignUpCompleteScreen() {
  const { t, i18n } = useTranslation();
  const { login, refreshUser } = useAuth();
  const params = useLocalSearchParams<{ signupTicket?: string; name?: string; email?: string }>();
  const ticket = typeof params.signupTicket === "string" && params.signupTicket ? params.signupTicket : null;

  const [role, setRole] = React.useState<Role>("student");
  const [birthDate, setBirthDate] = React.useState("");
  const [country, setCountry] = React.useState("PT");
  const [termsAccepted, setTermsAccepted] = React.useState(false);
  const [errors, setErrors] = React.useState<CompleteErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [expired, setExpired] = React.useState(false);

  if (!ticket || expired) {
    return (
      <View className="flex-1 justify-center bg-sidebar p-4">
        <Card className="w-full">
          <CardContent className="gap-4 pt-6" testID="social-complete-expired">
            <Text className="text-center text-sm text-muted-foreground">{t("auth.social.native.expired")}</Text>
            <Button testID="social-complete-back" onPress={() => router.replace("/signup")}>
              <Text>{t("auth.social.complete.backToSignup")}</Text>
            </Button>
          </CardContent>
        </Card>
      </View>
    );
  }

  const setFieldError = (field: CompleteField, message: string | undefined) =>
    setErrors((e) => ({ ...e, [field]: message }));

  const handleSubmit = async () => {
    setFormError(null);
    const { errors: found, iso } = validateCompletion({ birthDate, country, termsAccepted });
    if (Object.keys(found).length > 0 || !iso) {
      const next: CompleteErrors = {};
      for (const [field, key] of Object.entries(found)) next[field as CompleteField] = t(`auth.signup.${key}`);
      setErrors(next);
      setFormError(t("auth.signup.fixHighlighted"));
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const res = await authApi.completeSocialSignUp({
        signupTicket: ticket,
        role,
        birthDate: iso,
        country,
        termsAccepted: true,
      });
      await enterSession({ login, refreshUser }, res.accessToken);
    } catch (err: unknown) {
      const info = describeApiError(err);
      const data = (err as { response?: { data?: { error?: string; code?: string } } }).response?.data;
      if (info.status === 401 && data?.error === "INVALID_SIGNUP_TICKET") {
        setExpired(true);
      } else if (
        info.status === 400 &&
        (info.field === "role" || info.field === "birthDate" || info.field === "country" || info.field === "terms")
      ) {
        const key = data?.code ? CODE_KEYS[data.code] : undefined;
        const field = info.field;
        setErrors((e) => ({
          ...e,
          [field]: key ? t(`auth.signup.${key}`) : (info.message ?? t("auth.social.complete.failed")),
        }));
        setFormError(t("auth.signup.fixHighlighted"));
      } else if (info.status === 409 && data?.error === "ALREADY_COMPLETED") {
        setFormError(t("auth.social.complete.alreadyCompleted"));
      } else if (info.status === 409) {
        setFormError(t("auth.signup.emailTaken"));
      } else if (info.status === 429) {
        const seconds = (err as { response?: { data?: { retryAfterSeconds?: number } } }).response?.data?.retryAfterSeconds ?? 60;
        setFormError(t("auth.login.rateLimited", { seconds }));
      } else if (info.network) {
        setFormError(t("auth.login.networkError"));
      } else {
        setFormError(info.message ?? t("auth.social.complete.failed"));
      }
    } finally {
      setLoading(false);
    }
  };

  const roleOption = (value: Role, label: string, description: string) => {
    const selected = role === value;
    return (
      <Pressable
        testID={`social-complete-role-${value}`}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={label}
        onPress={() => setRole(value)}
        disabled={loading}
        className={"flex-1 rounded-lg border p-3 " + (selected ? "border-primary bg-primary/10" : "border-border")}
      >
        <Text className="font-medium">{label}</Text>
        <Text className="text-xs text-muted-foreground">{description}</Text>
      </Pressable>
    );
  };

  const fieldError = (field: CompleteField) =>
    errors[field] ? (
      <Text className="text-sm text-destructive" testID={`social-complete-${field}-error`} accessibilityLiveRegion="polite">
        {errors[field]}
      </Text>
    ) : null;

  return (
    <KeyboardAvoidingView className="flex-1 bg-sidebar" behavior={keyboardAvoidingBehavior()}>
      <StatusBar style="light" />
      <ScrollView contentContainerClassName="flex-grow justify-center p-4" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View className="mb-6 items-center">
          <LevAppMark size={30} />
        </View>

        <Card className="w-full" testID="social-complete">
          <CardHeader>
            <CardTitle className="text-center">{t("auth.social.complete.title")}</CardTitle>
            <CardDescription className="text-center">{t("auth.social.complete.subtitle")}</CardDescription>
          </CardHeader>

          <CardContent className="gap-4">
            <View className="gap-1 rounded-md border border-border p-3">
              <Text className="font-medium" testID="social-complete-name">{params.name}</Text>
              <Text className="text-sm text-muted-foreground" testID="social-complete-email">{params.email}</Text>
            </View>

            <View className="gap-1.5">
              <Label>{t("auth.signup.role")}</Label>
              <View className="flex-row gap-2">
                {roleOption("student", t("auth.signup.roleStudent"), t("auth.signup.roleStudentDescription"))}
                {roleOption("coach", t("auth.signup.roleCoach"), t("auth.signup.roleCoachDescription"))}
              </View>
              {role === "coach" ? (
                <Text className="text-xs text-muted-foreground">{t("auth.signup.coachApprovalNote")}</Text>
              ) : null}
              {fieldError("role")}
            </View>

            <View className="gap-1.5">
              <Label>{t("auth.signup.birthDate")}</Label>
              <Input
                testID="social-complete-birthDate"
                accessibilityLabel={t("auth.signup.birthDate")}
                placeholder="DD/MM/AAAA"
                keyboardType="number-pad"
                maxLength={10}
                value={birthDate}
                onChangeText={(v) => {
                  const next = formatBirthInput(v);
                  setBirthDate(next);
                  setFieldError("birthDate", undefined);
                  // The number pad has no Done key: close it once the date is complete.
                  if (next.length === 10) Keyboard.dismiss();
                }}
                editable={!loading}
                className={errors.birthDate ? "border-destructive" : undefined}
              />
              {fieldError("birthDate")}
            </View>

            <View className="gap-1.5">
              <Label>{t("auth.signup.country")}</Label>
              <Select
                value={{ value: country, label: countryName(country, i18n.language) }}
                onValueChange={(opt) => {
                  if (opt?.value) setCountry(opt.value);
                  setFieldError("country", undefined);
                }}
              >
                <SelectTrigger testID="social-complete-country" disabled={loading}>
                  <SelectValue placeholder={t("auth.signup.country")} />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code} label={countryName(c.code, i18n.language)} />
                  ))}
                </SelectContent>
              </Select>
              {fieldError("country")}
            </View>

            <View className="gap-1">
              <View className="flex-row items-start gap-2">
                <Pressable
                  testID="social-complete-terms"
                  role="checkbox"
                  accessibilityState={{ checked: termsAccepted, disabled: loading }}
                  accessibilityLabel={`${t("auth.signup.termsAcceptPrefix")} ${t("auth.legal.privacyPolicy")} ${t("auth.signup.termsAcceptJoin")} ${t("auth.legal.terms")}`}
                  disabled={loading}
                  hitSlop={8}
                  onPress={() => {
                    setTermsAccepted((on) => !on);
                    setFieldError("terms", undefined);
                  }}
                >
                  <View pointerEvents="none">
                    <Checkbox
                      checked={termsAccepted}
                      onCheckedChange={() => undefined}
                      disabled={loading}
                      className={errors.terms ? "border-destructive" : undefined}
                    />
                  </View>
                </Pressable>
                <View className="flex-1 flex-row flex-wrap items-center gap-x-1">
                  <Text className="text-sm">{t("auth.signup.termsAcceptPrefix")}</Text>
                  <Pressable accessibilityRole="link" testID="social-complete-terms-privacy" onPress={() => void Linking.openURL(legalUrl(PRIVACY_POLICY_URL, i18n.language))}>
                    <Text className="text-sm text-primary underline">{t("auth.legal.privacyPolicy")}</Text>
                  </Pressable>
                  <Text className="text-sm">{t("auth.signup.termsAcceptJoin")}</Text>
                  <Pressable accessibilityRole="link" testID="social-complete-terms-terms" onPress={() => void Linking.openURL(legalUrl(TERMS_URL, i18n.language))}>
                    <Text className="text-sm text-primary underline">{t("auth.legal.terms")}</Text>
                  </Pressable>
                </View>
              </View>
              {fieldError("terms")}
            </View>

            {formError ? (
              <Text className="text-center text-sm text-destructive" testID="social-complete-error">
                {formError}
              </Text>
            ) : null}

            <Button testID="social-complete-submit" accessibilityLabel={t("auth.social.complete.submit")} onPress={handleSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color="#ffffff" /> : <Text>{t("auth.social.complete.submit")}</Text>}
            </Button>
          </CardContent>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
