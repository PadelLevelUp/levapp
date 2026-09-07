import * as React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from "react-native";
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

export type AccountFormField = {
  /** Key in the values object; also the i18n suffix for the label. */
  id: string;
  label: string;
  secure?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad";
  autoComplete?: React.ComponentProps<typeof Input>["autoComplete"];
};

export function PreAuthShell({
  children,
  testID,
}: {
  children: React.ReactNode;
  testID: string;
}) {
  return (
    <KeyboardAvoidingView
      className="flex-1 bg-sidebar"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        testID={testID}
        contentContainerClassName="flex-grow justify-center p-4"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View className="mb-8 items-center">
          <LevAppMark size={40} />
        </View>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

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
}: {
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
  testID: string;
  tone?: "destructive" | "neutral";
}) {
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
}) {
  return (
    <PreAuthShell testID={testID}>
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-center">{title}</CardTitle>
          <CardDescription className="text-center">{description}</CardDescription>
        </CardHeader>

        <CardContent className="gap-4">
          {fields.map((field) => (
            <View key={field.id} className="gap-1.5">
              <Label testID={`${testID}-${field.id}-label`}>{field.label}</Label>
              <Input
                testID={`${testID}-${field.id}`}
                accessibilityLabel={field.label}
                value={values[field.id] ?? ""}
                onChangeText={(next) => onChangeField(field.id, next)}
                secureTextEntry={field.secure}
                keyboardType={field.keyboardType ?? "default"}
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
          ))}

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
