import { authApi } from "@levelup/api";
import { LEGAL_CATCH_UP_BIRTH_DATE_KEYS, legalCatchUpParts, legalCatchUpSession } from "@levelup/config";
import { Redirect, router } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { postLoginLanding } from "@/auth/postLoginRoute";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Text } from "@/components/ui/text";
import { PreAuthShell } from "@/features/auth/AccountSetupScreen";
import { TermsAcceptField } from "@/features/auth/TermsAcceptField";
import { legalCatchUpBody, legalCatchUpErrors } from "@/features/auth/legal-catch-up";
import { formatBirthInput } from "@/features/auth/signup-form";

/**
 * PAD-637 (auth.legal-catch-up): an older account is asked once per session for the Terms and/or a birth
 * date, only what is missing. "Agora não" skips for the session (rule 4); under 18 saves nothing (rule
 * 5). Mirrors web's `/legal-catch-up`.
 */
export default function LegalCatchUpScreen() {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const parts = legalCatchUpParts(user);
  const [termsAccepted, setTermsAccepted] = React.useState(false);
  const [birthDate, setBirthDate] = React.useState("");
  const [errors, setErrors] = React.useState<{ terms?: string; birthDate?: string; form?: string }>({});
  const [saving, setSaving] = React.useState(false);

  // Nothing pending (another device already saved): carry on.
  if (!parts.terms && !parts.birthDate) return <Redirect href={postLoginLanding(user) as never} />;

  const moveOn = (me: typeof user) => router.replace(postLoginLanding(me) as never);

  const notNow = () => {
    if (user?.id != null) legalCatchUpSession.skip(user.id);
    moveOn(user);
  };

  const save = async () => {
    const codes = legalCatchUpErrors(parts, { termsAccepted, birthDate });
    if (codes.terms || codes.birthDate) {
      setErrors({
        terms: codes.terms ? t("auth.legal.termsRequiredToContinue") : undefined,
        birthDate: codes.birthDate ? t(`auth.legalCatchUp.${codes.birthDate}`) : undefined,
      });
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      // Route on the `me` the save answers (nothing pending any more), not on a refresh that may fail.
      const me = await authApi.acceptLegal(legalCatchUpBody(parts, { termsAccepted, birthDate }));
      void refreshUser();
      moveOn(me);
    } catch (error) {
      const data = (error as { response?: { data?: { field?: string; code?: string } } })?.response?.data;
      if (data?.field === "terms") setErrors({ terms: t("auth.legal.termsRequiredToContinue") });
      else if (data?.field === "birthDate") {
        setErrors({ birthDate: t(`auth.legalCatchUp.${LEGAL_CATCH_UP_BIRTH_DATE_KEYS[data.code ?? ""] ?? "birthDateRequired"}`) });
      } else setErrors({ form: t("auth.legalCatchUp.saveFailed") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <PreAuthShell testID="legal-catch-up">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-center">{t("auth.legalCatchUp.title")}</CardTitle>
          <CardDescription className="text-center">{t("auth.legalCatchUp.intro")}</CardDescription>
        </CardHeader>
        <CardContent className="gap-4">
          {parts.birthDate ? (
            <View className="gap-1.5">
              <Label>{t("auth.legalCatchUp.birthDateLabel")}</Label>
              <Input
                testID="legal-catch-up-birthDate"
                accessibilityLabel={t("auth.legalCatchUp.birthDateLabel")}
                value={birthDate}
                onChangeText={(next) => {
                  setBirthDate(formatBirthInput(next));
                  setErrors((prev) => ({ ...prev, birthDate: undefined }));
                }}
                keyboardType="number-pad"
                placeholder="DD/MM/AAAA"
                editable={!saving}
              />
              <Text className="text-xs text-muted-foreground">{t("auth.legalCatchUp.birthDateHint")}</Text>
              {errors.birthDate ? (
                <Text className="text-sm text-destructive" testID="legal-catch-up-birthDate-error">
                  {errors.birthDate}
                </Text>
              ) : null}
            </View>
          ) : null}

          {parts.terms ? (
            <TermsAcceptField
              testID="legal-catch-up-terms"
              checked={termsAccepted}
              disabled={saving}
              error={errors.terms}
              onToggle={() => {
                setTermsAccepted((on) => !on);
                setErrors((prev) => ({ ...prev, terms: undefined }));
              }}
            />
          ) : null}

          {errors.form ? <Text className="text-center text-sm text-destructive">{errors.form}</Text> : null}

          <Button testID="legal-catch-up-save" onPress={() => void save()} disabled={saving}>
            {saving ? <ActivityIndicator color="#ffffff" /> : <Text>{t("auth.legalCatchUp.save")}</Text>}
          </Button>
          <Button testID="legal-catch-up-not-now" variant="ghost" onPress={notNow} disabled={saving}>
            <Text>{t("auth.legalCatchUp.notNow")}</Text>
          </Button>
        </CardContent>
      </Card>
    </PreAuthShell>
  );
}
