import * as React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  ScrollView,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { CountryField } from "@/features/auth/CountryField";
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
import { TermsAcceptField } from "@/features/auth/TermsAcceptField";
import { PreAuthShell, WelcomeBand } from "@/features/auth/PreAuthShell";
import { typedChosenUsername } from "@levelup/config";

/**
 * The chrome the three account-creation screens share (PAD-164).
 *
 * Player-invite, coach-invite and register differ only in their namespace, the
 * fields they collect and the request they fire; the shell — branded header,
 * keyboard handling, a labelled column of inputs with per-field errors, one
 * submit button — is identical on all three, and was identical across web's
 * three pages too. It lives here once rather than three times.
 *
 * These are pre-auth screens, so they mirror `app/login.tsx`: the sidebar
 * background with the LevApp mark above the card, not the in-app `Screen`
 * wrapper (which paints the signed-in background and expects a tab navigator).
 */

export { PreAuthShell, WelcomeBand };

export type AccountFormField = {
  /** Key in the values object; also the i18n suffix for the label. */
  id: string;
  label: string;
  secure?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad" | "number-pad";
  autoComplete?: React.ComponentProps<typeof Input>["autoComplete"];
  /** PAD-457: e.g. "DD/MM/AAAA" for the activation form's birth date. */
  placeholder?: string;
  /** PAD-604: a country picker (ISO alpha-2 in `values`) instead of a text box.
   * PAD-637: "terms" is the Terms box (`values[id]` is "true" when ticked; auth.register rule 19b). */
  kind?: "country" | "terms";
};

/**
 * Full-screen spinner while the invitation / user lookup is in flight.
 *
 * Web renders `null` here. On a phone that reads as a broken app: the link just
 * launched a native app and a blank sidebar-coloured screen is the first thing
 * it shows. A spinner costs nothing and says "working".
 */
export function AccountSetupLoading({ testID }: { testID: string }) {
  return (
    <PreAuthShell testID={testID}>
      <View className="items-center py-6">
        <ActivityIndicator size="large" color="#ffffff" />
      </View>
    </PreAuthShell>
  );
}

/**
 * Dead-end state: the token is missing, unknown, used, revoked or expired.
 * One action, and it is the only one that can help — go to the sign-in screen.
 */
export function AccountSetupNotice({
  title,
  description,
  actionLabel,
  onAction,
  testID,
  tone = "destructive",
  welcome = false,
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  testID: string;
  tone?: "destructive" | "neutral";
  /** auth.invite-welcome: the words stand on the navy, outside the card (the invite screens' states). */
  welcome?: boolean;
}) {
  if (welcome) {
    return (
      <PreAuthShell testID={testID}>
        <WelcomeBand title={title} description={description} />
        <Card className="w-full">
          <CardContent className="pt-6">
            <Button testID={`${testID}-action`} onPress={onAction} className="min-h-11">
              <Text>{actionLabel}</Text>
            </Button>
          </CardContent>
        </Card>
      </PreAuthShell>
    );
  }
  return (
    <PreAuthShell testID={testID}>
      <Card className="w-full">
        <CardHeader>
          <CardTitle
            className={
              tone === "destructive" ? "text-center text-destructive" : "text-center"
            }
          >
            {title}
          </CardTitle>
          <CardDescription className="text-center">{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button testID={`${testID}-action`} onPress={onAction}>
            <Text>{actionLabel}</Text>
          </Button>
        </CardContent>
      </Card>
    </PreAuthShell>
  );
}

export function AccountSetupForm({
  title,
  description,
  fields,
  values,
  errors,
  onChangeField,
  onSubmit,
  submitLabel,
  submitting,
  submitError,
  testID,
  footer,
  welcome = false,
  names,
}: {
  title: string;
  description: string;
  fields: AccountFormField[];
  values: Record<string, string>;
  /** Already-translated message per field id. */
  errors: Record<string, string | undefined>;
  onChangeField: (id: string, value: string) => void;
  onSubmit: () => void;
  submitLabel: string;
  submitting: boolean;
  submitError: string | null;
  testID: string;
  /** Rendered under the card — the legal links on the register screen. */
  footer?: React.ReactNode;
  /** auth.invite-welcome: the words stand on the navy, outside the card (the two invitation screens). */
  welcome?: boolean;
  /** auth.invite-welcome (a): the coach and the club on the band, when the preview carries them. */
  names?: { coach: string; club: string };
}) {
  return (
    <PreAuthShell testID={testID}>
      {welcome ? <WelcomeBand title={title} description={description} names={names} /> : null}
      <Card className="w-full">
        {welcome ? null : (
          <CardHeader>
            <CardTitle className="text-center">{title}</CardTitle>
            <CardDescription className="text-center">{description}</CardDescription>
          </CardHeader>
        )}

        <CardContent className={welcome ? "gap-4 pt-6" : "gap-4"}>
          {fields.map((field) =>
            field.kind === "terms" ? (
              <TermsAcceptField
                key={field.id}
                testID={`${testID}-${field.id}`}
                checked={values[field.id] === "true"}
                onToggle={() => onChangeField(field.id, values[field.id] === "true" ? "" : "true")}
                error={errors[field.id]}
                disabled={submitting}
              />
            ) : field.kind === "country" ? (
              <CountryField
                key={field.id}
                testID={`${testID}-${field.id}`}
                label={field.label}
                value={values[field.id] ?? ""}
                error={errors[field.id]}
                disabled={submitting}
                onChange={(code) => onChangeField(field.id, code)}
              />
            ) : (
              <View key={field.id} className="gap-1.5">
                <Label testID={`${testID}-${field.id}-label`}>{field.label}</Label>
                <Input
                  testID={`${testID}-${field.id}`}
                  accessibilityLabel={field.label}
                  value={values[field.id] ?? ""}
                  // auth.register rule 2a (PAD-799): the chosen username is lowercase as it is typed.
                  onChangeText={(next) =>
                    onChangeField(field.id, field.id === "username" ? typedChosenUsername(next) : next)
                  }
                  secureTextEntry={field.secure}
                  keyboardType={field.keyboardType ?? "default"}
                  placeholder={field.placeholder}
                  autoComplete={field.autoComplete}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!submitting}
                />
                {errors[field.id] ? (
                  <Text
                    className="text-sm text-destructive"
                    testID={`${testID}-${field.id}-error`}
                  >
                    {errors[field.id]}
                  </Text>
                ) : null}
              </View>
            )
          )}

          {submitError ? (
            <Text
              className="text-center text-sm text-destructive"
              testID={`${testID}-error`}
            >
              {submitError}
            </Text>
          ) : null}

          <Button
            testID={`${testID}-submit`}
            accessibilityLabel={submitLabel}
            onPress={onSubmit}
            disabled={submitting}
            className={welcome ? "min-h-11" : undefined}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text>{submitLabel}</Text>
            )}
          </Button>
        </CardContent>
      </Card>
      {footer}
    </PreAuthShell>
  );
}
