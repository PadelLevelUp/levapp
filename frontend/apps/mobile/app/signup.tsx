import { router } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  ScrollView,
  type TextInput,
  View,
} from "react-native";
import { z } from "zod";
import { useAuth } from "@/auth/AuthContext";
import { needsEmailVerification, postLoginRoute } from "@/auth/postLoginRoute";
import { consumePendingJoin } from "@/auth/pendingJoin";
import { consumePendingClaim } from "@/auth/pendingClaim";
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
import { PRIVACY_POLICY_URL, TERMS_URL } from "@/lib/config";
import { describeApiError } from "@/lib/apiError";
import type { authApi } from "@levelup/api";
import { COUNTRIES, consentAgeFor, countryName, needsGuardian } from "@levelup/config";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GuardianPendingCard } from "@/features/auth/GuardianPendingCard";
import { keyboardAvoidingBehavior } from "@/lib/keyboard-avoiding";

type Role = "coach" | "student";
type Field = "name" | "username" | "email" | "password" | "repeatPassword" | "birthDate" | "guardianEmail";
type FieldErrors = Partial<Record<Field | "country", string>>;

/**
 * auth.parental-consent rule 10 (PAD-198): the birth date is typed as
 * DD/MM/AAAA with the number pad — the wheel picker opens on today, which is
 * slow for a date years back and cannot be driven by Maestro.
 */
function formatBirthInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** DD/MM/AAAA → YYYY-MM-DD for a real calendar date; null otherwise. */
function toIso(display: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** auth.parental-consent rule 2: the server's codes, in the form's own words. */
const CODE_KEYS: Record<string, string> = {
  BIRTH_DATE_REQUIRED: "birthDateRequired",
  INVALID_BIRTH_DATE: "birthDateInvalid",
  COUNTRY_REQUIRED: "countryRequired",
  INVALID_COUNTRY: "countryRequired",
  GUARDIAN_EMAIL_REQUIRED: "guardianEmailRequired",
  INVALID_GUARDIAN_EMAIL: "guardianEmailInvalid",
  GUARDIAN_EMAIL_IS_OWN: "guardianEmailIsOwn",
};

/** Same rules as web's SignUpPage (auth.register rules 2–4). */
const signUpSchema = z
  .object({
    name: z.string().trim().min(2, "nameMin"),
    username: z
      .string()
      .trim()
      .min(3, "usernameMin")
      .max(80, "usernameMax")
      .regex(/^[A-Za-z0-9._-]+$/, "usernameChars")
      .refine((u) => !u.toLowerCase().startsWith("pending-"), "usernameReserved"),
    email: z.string().trim().email("emailInvalid"),
    password: z.string().min(8, "passwordMin"),
    repeatPassword: z.string(),
    birthDate: z.string(),
    country: z.string().length(2, "countryRequired"),
    guardianEmail: z.string().trim(),
    forceGuardian: z.boolean(),
  })
  .refine((d) => d.password === d.repeatPassword, {
    message: "passwordsMismatch",
    path: ["repeatPassword"],
  })
  .superRefine((d, ctx) => {
    const iso = toIso(d.birthDate);
    if (!d.birthDate) {
      ctx.addIssue({ code: "custom", message: "birthDateRequired", path: ["birthDate"] });
      return;
    }
    if (!iso || new Date(`${iso}T00:00:00`) > new Date()) {
      ctx.addIssue({ code: "custom", message: "birthDateInvalid", path: ["birthDate"] });
      return;
    }
    if (!d.forceGuardian && !needsGuardian(iso, d.country)) return;
    const g = d.guardianEmail.toLowerCase();
    if (!g) ctx.addIssue({ code: "custom", message: "guardianEmailRequired", path: ["guardianEmail"] });
    else if (!z.string().email().safeParse(g).success)
      ctx.addIssue({ code: "custom", message: "guardianEmailInvalid", path: ["guardianEmail"] });
    else if (g === d.email.trim().toLowerCase())
      ctx.addIssue({ code: "custom", message: "guardianEmailIsOwn", path: ["guardianEmail"] });
  });

/**
 * auth.register — self-service signup, mirroring web's SignUpPage. On success
 * the session is stored exactly as login does (AuthContext.register), then a
 * student goes to Connect with a coach and a coach is routed by approval state
 * (rule 11).
 */
export default function SignUpScreen() {
  const { t, i18n } = useTranslation();
  const { register } = useAuth();
  const [role, setRole] = React.useState<Role>("student");
  const [form, setForm] = React.useState<Record<Field, string>>({
    name: "",
    username: "",
    email: "",
    password: "",
    repeatPassword: "",
    birthDate: "",
    guardianEmail: "",
  });
  const [country, setCountry] = React.useState("PT");
  // The server is the authority on consent ages (an operator may change one
  // without a release): a GUARDIAN_EMAIL_REQUIRED reveals the field anyway.
  const [forceGuardian, setForceGuardian] = React.useState(false);
  const [pending, setPending] = React.useState<authApi.GuardianPendingInfo | null>(null);
  const birthIso = toIso(form.birthDate);
  const showGuardian = forceGuardian || (!!birthIso && needsGuardian(birthIso, country));
  const [errors, setErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const scrollRef = React.useRef<ScrollView>(null);
  // y offset of each field inside the scroll view, so the first invalid one
  // can be brought into view (auth.register rule 10: every rejection names
  // the field, and the user must be able to see it).
  const fieldOffsets = React.useRef<Partial<Record<Field, number>>>({});
  // Next on each text field moves focus down the form and scrolls that field into
  // view: the keyboard covers the lower half of the form, so a field below it can't
  // be tapped (auth.parental-consent rule 10).
  const inputRefs = React.useRef<Partial<Record<Field, TextInput | null>>>({});
  const NEXT_FIELD: Partial<Record<Field, Field>> = {
    name: "username",
    username: "email",
    email: "password",
    password: "repeatPassword",
    repeatPassword: "birthDate",
  };
  const focusField = (field: Field) => {
    const y = fieldOffsets.current[field];
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
    inputRefs.current[field]?.focus();
  };

  const FIELD_ORDER: Field[] = ["name", "username", "email", "password", "repeatPassword", "birthDate", "guardianEmail"];
  const revealFirstError = (next: FieldErrors) => {
    const first = FIELD_ORDER.find((f) => next[f]);
    const y = first ? fieldOffsets.current[first] : undefined;
    if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 24), animated: true });
  };

  const setField = (field: Field, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const validate = (): boolean => {
    const result = signUpSchema.safeParse({ ...form, country, forceGuardian });
    if (result.success) {
      setErrors({});
      return true;
    }
    const next: FieldErrors = {};
    for (const issue of result.error.errors) {
      const field = issue.path[0] as Field;
      if (!next[field]) next[field] = t(`auth.signup.${issue.message}`);
    }
    setErrors(next);
    setFormError(t("auth.signup.fixHighlighted"));
    revealFirstError(next);
    return false;
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!validate()) return;
    setLoading(true);
    try {
      const result = await register({
        role,
        name: form.name.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        birthDate: birthIso ?? "",
        country,
        ...(showGuardian ? { guardianEmail: form.guardianEmail.trim() } : {}),
      });
      // auth.parental-consent rule 3: a minor gets no session; the guardian decides.
      if (result.guardianPending) {
        setPending(result.guardianPending);
        return;
      }
      const me = result.user;
      let destination: string;
      if (role === "student") {
        // players.join-token rule 9: back to the join link if that is where
        // the student came from, else the generic "Connect" screen.
        const pending = consumePendingJoin();
        const pendingClaim = consumePendingClaim();
        destination = pendingClaim
          ? `/invite/player/${pendingClaim}`
          : pending
            ? `/join/coach/${pending}`
            : "/connect";
      } else {
        destination = postLoginRoute({ ...me, emailVerification: "verified" });
      }
      // auth.register rule 14: the code screen comes first, then `destination`.
      router.replace(
        (needsEmailVerification(me)
          ? `/verify-email?next=${encodeURIComponent(destination)}`
          : destination) as never
      );
    } catch (err: unknown) {
      const info = describeApiError(err);
      const code = (err as { response?: { data?: { code?: string } } }).response?.data?.code;
      const codeKey = code ? CODE_KEYS[code] : undefined;
      if (info.status === 400 && codeKey && info.field) {
        if (code === "GUARDIAN_EMAIL_REQUIRED") setForceGuardian(true);
        const next = { ...errors, [info.field]: t(`auth.signup.${codeKey}`) };
        setErrors(next);
        setFormError(t("auth.signup.fixHighlighted"));
        revealFirstError(next);
        return;
      }
      const isField = (f: string | undefined): f is Field =>
        !!f && (FIELD_ORDER as string[]).includes(f);
      if (info.status === 409 && isField(info.field)) {
        // Server-side uniqueness: under the field it names, in our words.
        const message =
          info.field === "username"
            ? t("auth.signup.usernameTaken")
            : info.field === "email"
              ? t("auth.signup.emailTaken")
              : (info.message ?? t("auth.signup.failedDescription"));
        const next = { ...errors, [info.field]: message };
        setErrors(next);
        setFormError(t("auth.signup.fixHighlighted"));
        revealFirstError(next);
      } else if (isField(info.field)) {
        // Any other rejection that names a field: the server's message, under it.
        const next = { ...errors, [info.field]: info.message ?? t("auth.signup.failedDescription") };
        setErrors(next);
        setFormError(t("auth.signup.fixHighlighted"));
        revealFirstError(next);
      } else if (info.status === 429) {
        // auth.register rule 15 (PAD-228).
        const seconds = (err as { response?: { data?: { retryAfterSeconds?: number } } }).response?.data?.retryAfterSeconds ?? 60;
        setFormError(t("auth.login.rateLimited", { seconds }));
      } else if (info.network) {
        setFormError(t("auth.login.networkError"));
      } else if (info.routeMissing) {
        // The route itself is missing: the server is behind the app.
        setFormError(t("auth.signup.unavailable"));
      } else {
        // Field-less rejection: the server's own words, never a generic line alone.
        setFormError(info.message ?? t("auth.signup.failedDescription"));
      }
    } finally {
      setLoading(false);
    }
  };

  const RoleOption = ({ value, label, description }: { value: Role; label: string; description: string }) => {
    const selected = role === value;
    return (
      <Pressable
        testID={`signup-role-${value}`}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={label}
        onPress={() => setRole(value)}
        disabled={loading}
        className={
          "flex-1 rounded-lg border p-3 " +
          (selected ? "border-primary bg-primary/10" : "border-border")
        }
      >
        <Text className="font-medium">{label}</Text>
        <Text className="text-xs text-muted-foreground">{description}</Text>
      </Pressable>
    );
  };

  const fields: Array<{ field: Field; secure?: boolean; keyboard?: "email-address"; autoComplete: any }> = [
    { field: "name", autoComplete: "name" },
    { field: "username", autoComplete: "username-new" },
    { field: "email", keyboard: "email-address", autoComplete: "email" },
    { field: "password", secure: true, autoComplete: "new-password" },
    { field: "repeatPassword", secure: true, autoComplete: "new-password" },
  ];

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-sidebar"
      behavior={keyboardAvoidingBehavior()}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerClassName="flex-grow justify-center p-4"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View className="mb-6 items-center">
          <LevAppMark size={30} />
        </View>

        <Card className="w-full" testID="screen-signup">
          <CardHeader>
            <CardTitle className="text-center">{t("auth.signup.title")}</CardTitle>
            <CardDescription className="text-center">{t("auth.signup.description")}</CardDescription>
          </CardHeader>

          <CardContent className="gap-4">
            {pending ? (
              <GuardianPendingCard
                username={form.username.trim()}
                password={form.password}
                info={pending}
                onBack={() => router.replace("/login")}
              />
            ) : (
            <>
            <View className="gap-1.5">
              <Label>{t("auth.signup.role")}</Label>
              <View className="flex-row gap-2">
                <RoleOption
                  value="student"
                  label={t("auth.signup.roleStudent")}
                  description={t("auth.signup.roleStudentDescription")}
                />
                <RoleOption
                  value="coach"
                  label={t("auth.signup.roleCoach")}
                  description={t("auth.signup.roleCoachDescription")}
                />
              </View>
              {role === "coach" ? (
                <Text className="text-xs text-muted-foreground" testID="signup-coach-approval-note">
                  {t("auth.signup.coachApprovalNote")}
                </Text>
              ) : null}
            </View>

            {fields.map(({ field, secure, keyboard, autoComplete }) => (
              <View
                className="gap-1.5"
                key={field}
                onLayout={(e) => {
                  fieldOffsets.current[field] = e.nativeEvent.layout.y;
                }}
              >
                <Label>{t(`auth.signup.${field}`)}</Label>
                <Input
                  ref={(el) => {
                    inputRefs.current[field] = el;
                  }}
                  testID={`signup-${field}`}
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => {
                    const next = NEXT_FIELD[field];
                    if (next) focusField(next);
                  }}
                  accessibilityLabel={t(`auth.signup.${field}`)}
                  value={form[field]}
                  onChangeText={(v) => setField(field, v)}
                  secureTextEntry={secure}
                  keyboardType={keyboard}
                  autoCapitalize={field === "name" ? "words" : "none"}
                  autoCorrect={false}
                  autoComplete={autoComplete}
                  editable={!loading}
                  className={errors[field] ? "border-destructive" : undefined}
                />
                {errors[field] ? (
                  <Text
                    className="text-sm text-destructive"
                    testID={`signup-error-${field}`}
                    accessibilityLiveRegion="polite"
                  >
                    {errors[field]}
                  </Text>
                ) : null}
              </View>
            ))}

            {/* auth.parental-consent rule 10 (PAD-198). */}
            <View
              className="gap-1.5"
              onLayout={(e) => {
                fieldOffsets.current.birthDate = e.nativeEvent.layout.y;
              }}
            >
              <Label>{t("auth.signup.birthDate")}</Label>
              <Input
                ref={(el) => {
                  inputRefs.current.birthDate = el;
                }}
                testID="signup-birthDate"
                accessibilityLabel={t("auth.signup.birthDate")}
                placeholder="DD/MM/AAAA"
                keyboardType="number-pad"
                maxLength={10}
                value={form.birthDate}
                onChangeText={(v) => {
                  const next = formatBirthInput(v);
                  setField("birthDate", next);
                  // The number pad has no Done key: close it once the date is complete.
                  if (next.length === 10) Keyboard.dismiss();
                }}
                editable={!loading}
                className={errors.birthDate ? "border-destructive" : undefined}
              />
              {errors.birthDate ? (
                <Text className="text-sm text-destructive" testID="signup-error-birthDate" accessibilityLiveRegion="polite">
                  {errors.birthDate}
                </Text>
              ) : null}
            </View>

            <View className="gap-1.5">
              <Label>{t("auth.signup.country")}</Label>
              <Select
                value={{ value: country, label: countryName(country, i18n.language) }}
                onValueChange={(opt) => {
                  if (opt?.value) setCountry(opt.value);
                  setErrors((e) => ({ ...e, country: undefined }));
                }}
              >
                <SelectTrigger testID="signup-country" disabled={loading}>
                  <SelectValue placeholder={t("auth.signup.country")} />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code} label={countryName(c.code, i18n.language)} />
                  ))}
                </SelectContent>
              </Select>
              {errors.country ? (
                <Text className="text-sm text-destructive" testID="signup-error-country">
                  {errors.country}
                </Text>
              ) : null}
            </View>

            {showGuardian ? (
              <View
                className="gap-1.5"
                testID="signup-guardian"
                onLayout={(e) => {
                  fieldOffsets.current.guardianEmail = e.nativeEvent.layout.y;
                }}
              >
                <Label>{t("auth.signup.guardianEmail")}</Label>
                <Text className="text-xs text-muted-foreground">
                  {t("auth.signup.guardianEmailHint", { age: consentAgeFor(country) })}
                </Text>
                <Input
                  testID="signup-guardianEmail"
                  accessibilityLabel={t("auth.signup.guardianEmail")}
                  keyboardType="email-address"
                  returnKeyType="done"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={form.guardianEmail}
                  onChangeText={(v) => setField("guardianEmail", v)}
                  editable={!loading}
                  className={errors.guardianEmail ? "border-destructive" : undefined}
                />
                {errors.guardianEmail ? (
                  <Text className="text-sm text-destructive" testID="signup-error-guardianEmail" accessibilityLiveRegion="polite">
                    {errors.guardianEmail}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {formError ? (
              <Text className="text-center text-sm text-destructive" testID="signup-error">
                {formError}
              </Text>
            ) : null}

            <Button
              testID="signup-submit"
              accessibilityLabel={t("auth.signup.create")}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#ffffff" /> : <Text>{t("auth.signup.create")}</Text>}
            </Button>

            <View className="flex-row items-center justify-center gap-1">
              <Text className="text-sm text-muted-foreground">{t("auth.signup.haveAccount")}</Text>
              <Pressable
                testID="signup-go-to-login"
                accessibilityRole="link"
                onPress={() => router.replace("/login")}
                disabled={loading}
              >
                <Text className="text-sm font-medium text-primary underline">{t("auth.signup.signIn")}</Text>
              </Pressable>
            </View>
            </>
            )}
          </CardContent>
        </Card>

        <View className="mt-4 flex-row flex-wrap items-center justify-center gap-1">
          <Text className="text-xs text-sidebar-foreground opacity-70">{t("auth.signup.legalPrefix")}</Text>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}>
            <Text className="text-xs text-sidebar-foreground underline opacity-90">
              {t("auth.legal.privacyPolicy")}
            </Text>
          </Pressable>
          <Text className="text-xs text-sidebar-foreground opacity-70">{t("auth.legal.separator")}</Text>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(TERMS_URL)}>
            <Text className="text-xs text-sidebar-foreground underline opacity-90">{t("auth.legal.terms")}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
