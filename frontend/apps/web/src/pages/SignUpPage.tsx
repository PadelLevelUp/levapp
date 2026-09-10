import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { getMe, register, type RegisterPayload } from "@/api/auth";
import { useAuth } from "@/auth/AuthContext";
import { needsEmailVerification, postLoginPath } from "@/auth/postLoginPath";
import { consumePostAuthRedirect } from "@/auth/postAuthRedirect";
import { cn } from "@/lib/utils";
import { GraduationCap, User } from "lucide-react";
import { COUNTRIES, consentAgeFor, countryName, needsGuardian } from "@levelup/config";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GuardianPendingCard } from "@/components/auth/GuardianPendingCard";
import type { GuardianPendingInfo } from "@/api/auth";

type Role = RegisterPayload["role"];

/**
 * auth.register — self-service signup for both roles.
 *
 * Mirrors the API's own rules so the common mistakes never reach it (rules
 * 2–4): a chosen username is 3–80 chars of `[A-Za-z0-9._-]` and may not look
 * like a system placeholder; email is required; password is at least 8.
 * The server stays the authority — a 409 on username/email is rendered under
 * the field it names.
 */
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
    // auth.parental-consent rule 2 (PAD-198).
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "birthDateRequired")
      .refine((d) => !Number.isNaN(Date.parse(d)) && new Date(`${d}T00:00:00`) <= new Date(), "birthDateInvalid"),
    country: z.string().length(2, "countryRequired"),
    guardianEmail: z.string().trim(),
    forceGuardian: z.boolean(),
  })
  .refine((d) => d.password === d.repeatPassword, {
    message: "passwordsMismatch",
    path: ["repeatPassword"],
  })
  .superRefine((d, ctx) => {
    if (!d.forceGuardian && !needsGuardian(d.birthDate, d.country)) return;
    const g = d.guardianEmail.toLowerCase();
    if (!g) ctx.addIssue({ code: "custom", message: "guardianEmailRequired", path: ["guardianEmail"] });
    else if (!z.string().email().safeParse(g).success)
      ctx.addIssue({ code: "custom", message: "guardianEmailInvalid", path: ["guardianEmail"] });
    else if (g === d.email.trim().toLowerCase())
      ctx.addIssue({ code: "custom", message: "guardianEmailIsOwn", path: ["guardianEmail"] });
  });

type FieldErrors = Partial<
  Record<"name" | "username" | "email" | "password" | "repeatPassword" | "birthDate" | "country" | "guardianEmail", string>
>;

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

const SignUpPage = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { login } = useAuth();

  const [role, setRole] = useState<Role>("student");
  const [form, setForm] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    repeatPassword: "",
    birthDate: "",
    country: "PT",
    guardianEmail: "",
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  // The server is the authority on consent ages (an operator may change one
  // without a release): a GUARDIAN_EMAIL_REQUIRED reveals the field anyway.
  const [forceGuardian, setForceGuardian] = useState(false);
  const [pending, setPending] = useState<GuardianPendingInfo | null>(null);
  const showGuardian = forceGuardian || needsGuardian(form.birthDate, form.country);

  const setField = (field: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const validate = () => {
    const result = signUpSchema.safeParse({ ...form, forceGuardian });
    if (result.success) {
      setErrors({});
      return true;
    }
    const next: FieldErrors = {};
    for (const issue of result.error.errors) {
      const field = String(issue.path[0]) as keyof FieldErrors;
      if (!next[field]) next[field] = t(`auth.signup.${issue.message}`);
    }
    setErrors(next);
    return false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const res = await register({
        role,
        name: form.name.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        birthDate: form.birthDate,
        country: form.country,
        ...(showGuardian ? { guardianEmail: form.guardianEmail.trim() } : {}),
      });
      // auth.parental-consent rule 3: a minor gets no session; the guardian decides.
      if (res.guardianConsent === "pending" || !res.accessToken) {
        setPending({
          guardianEmail: res.guardianEmail ?? null,
          resendAvailableInSeconds: res.resendAvailableInSeconds ?? 60,
        });
        return;
      }
      // Same persistence as AuthPage: `login(token)` writes localStorage and
      // hydrates the session from /auth/me before we route on it.
      await login(res.accessToken);
      // `login()` already loaded the user; re-read it through the same
      // helper the guards use so the two can never disagree.
      const me = await getMe();
      const pendingCode = needsEmailVerification(me);
      toast({
        title: t("auth.signup.welcomeTitle"),
        description: pendingCode
          ? t("auth.verifyEmail.toastDescription")
          : role === "coach"
            ? t("auth.signup.welcomeCoachDescription")
            : t("auth.signup.welcomeStudentDescription"),
      });
      // auth.register rule 11. A brand-new student goes to "Connect with a
      // coach" regardless of what postLoginPath knows about them; a coach is
      // routed by approval state (pending, on a fresh signup).
      // players.join-token rule 9: a student who arrived from a join link
      // goes straight back to it instead of the generic "Connect" screen.
      const destination =
        role === "student" ? (consumePostAuthRedirect() ?? "/connect") : postLoginPath({ ...me, emailVerification: "verified" });
      // auth.register rule 14: the code screen comes first, then `destination`.
      navigate(pendingCode ? `/verify-email?next=${encodeURIComponent(destination)}` : destination, {
        replace: true,
      });
    } catch (err: unknown) {
      const data = (err as { response?: { status?: number; data?: { error?: string; field?: string; code?: string } } })
        .response;
      const codeKey = data?.data?.code ? CODE_KEYS[data.data.code] : undefined;
      if (data?.status === 400 && codeKey && data.data?.field) {
        if (data.data.code === "GUARDIAN_EMAIL_REQUIRED") setForceGuardian(true);
        setErrors((prev) => ({ ...prev, [data.data!.field as keyof FieldErrors]: t(`auth.signup.${codeKey}`) }));
        return;
      }
      if (data?.status === 409 && (data.data?.field === "username" || data.data?.field === "email")) {
        const field = data.data.field;
        setErrors((prev) => ({
          ...prev,
          [field]: field === "username" ? t("auth.signup.usernameTaken") : t("auth.signup.emailTaken"),
        }));
      } else if (data?.status === 400 && data.data?.field) {
        setErrors((prev) => ({ ...prev, [data.data!.field as keyof FieldErrors]: data.data?.error }));
      } else if (data?.status === 429) {
        // auth.register rule 15 (PAD-228).
        const seconds = (data.data as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds ?? 60;
        toast({ variant: "destructive", title: t("auth.signup.failedTitle"), description: t("auth.login.rateLimited", { seconds }) });
      } else if (!data) {
        toast({ variant: "destructive", title: t("auth.signup.failedTitle"), description: t("auth.login.networkError") });
      } else if (data.status === 404 || data.status === 405) {
        // The route itself is missing: this server is behind the app (PAD-225).
        toast({ variant: "destructive", title: t("auth.signup.failedTitle"), description: t("auth.signup.unavailable") });
      } else {
        // Field-less rejection: the server's own words, never a generic line alone.
        toast({
          variant: "destructive",
          title: t("auth.signup.failedTitle"),
          description: data.data?.error ?? t("auth.signup.failedDescription"),
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const RoleOption = ({ value, icon, label, description }: { value: Role; icon: React.ReactNode; label: string; description: string }) => (
    <button
      type="button"
      role="radio"
      aria-checked={role === value}
      data-testid={`signup-role-${value}`}
      onClick={() => setRole(value)}
      className={cn(
        "flex flex-1 flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
        role === value ? "border-primary bg-primary/10" : "border-border hover:bg-muted"
      )}
    >
      <span className="flex items-center gap-2 font-medium">
        {icon}
        {label}
      </span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <img src="/brand/levapp-lockup-on-light.svg" alt="LevApp" className="mb-8 h-12 w-auto dark:hidden" />
      <img src="/brand/levapp-lockup-on-dark.svg" alt="LevApp" className="mb-8 hidden h-12 w-auto dark:block" />

      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">{t("auth.signup.title")}</CardTitle>
          <CardDescription className="text-center">{t("auth.signup.description")}</CardDescription>
        </CardHeader>

        <CardContent>
          {pending ? (
            <GuardianPendingCard
              username={form.username.trim()}
              password={form.password}
              info={pending}
              onBack={() => navigate("/auth", { replace: true })}
            />
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label>{t("auth.signup.role")}</Label>
              <div className="flex gap-2" role="radiogroup" aria-label={t("auth.signup.role")}>
                <RoleOption
                  value="student"
                  icon={<User className="h-4 w-4" />}
                  label={t("auth.signup.roleStudent")}
                  description={t("auth.signup.roleStudentDescription")}
                />
                <RoleOption
                  value="coach"
                  icon={<GraduationCap className="h-4 w-4" />}
                  label={t("auth.signup.roleCoach")}
                  description={t("auth.signup.roleCoachDescription")}
                />
              </div>
              {role === "coach" && (
                <p className="text-xs text-muted-foreground" data-testid="signup-coach-approval-note">
                  {t("auth.signup.coachApprovalNote")}
                </p>
              )}
            </div>

            {(
              [
                ["name", "text", "name"],
                ["username", "text", "username"],
                ["email", "email", "email"],
                ["password", "password", "new-password"],
                ["repeatPassword", "password", "new-password"],
              ] as const
            ).map(([field, type, autoComplete]) => (
              <div className="space-y-2" key={field}>
                <Label htmlFor={`signup-${field}`}>{t(`auth.signup.${field}`)}</Label>
                <Input
                  id={`signup-${field}`}
                  type={type}
                  autoComplete={autoComplete}
                  autoCapitalize={field === "name" ? "words" : "none"}
                  value={form[field]}
                  onChange={(e) => setField(field, e.target.value)}
                />
                {errors[field] && (
                  <p className="text-sm text-destructive" data-testid={`signup-${field}-error`}>
                    {errors[field]}
                  </p>
                )}
              </div>
            ))}

            {/* auth.parental-consent rule 10 (PAD-198). */}
            <div className="space-y-2">
              <Label htmlFor="signup-birthDate">{t("auth.signup.birthDate")}</Label>
              <Input
                id="signup-birthDate"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={form.birthDate}
                onChange={(e) => setField("birthDate", e.target.value)}
              />
              {errors.birthDate && (
                <p className="text-sm text-destructive" data-testid="signup-birthDate-error">
                  {errors.birthDate}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="signup-country">{t("auth.signup.country")}</Label>
              <Select value={form.country} onValueChange={(v) => setField("country", v)}>
                <SelectTrigger id="signup-country" data-testid="signup-country">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {countryName(c.code, i18n.language)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.country && (
                <p className="text-sm text-destructive" data-testid="signup-country-error">
                  {errors.country}
                </p>
              )}
            </div>

            {showGuardian && (
              <div className="space-y-2" data-testid="signup-guardian">
                <Label htmlFor="signup-guardianEmail">{t("auth.signup.guardianEmail")}</Label>
                <p className="text-xs text-muted-foreground">
                  {t("auth.signup.guardianEmailHint", { age: consentAgeFor(form.country) })}
                </p>
                <Input
                  id="signup-guardianEmail"
                  type="email"
                  autoComplete="off"
                  value={form.guardianEmail}
                  onChange={(e) => setField("guardianEmail", e.target.value)}
                />
                {errors.guardianEmail && (
                  <p className="text-sm text-destructive" data-testid="signup-guardianEmail-error">
                    {errors.guardianEmail}
                  </p>
                )}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={submitting} data-testid="signup-submit">
              {submitting ? t("auth.signup.creating") : t("auth.signup.create")}
            </Button>
          </form>
          )}

          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("auth.signup.haveAccount")}{" "}
            <Link to="/auth" className="underline hover:text-foreground">
              {t("auth.signup.signIn")}
            </Link>
          </p>
        </CardContent>
      </Card>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        {t("auth.signup.legalPrefix")}{" "}
        <Link to="/privacy" className="underline hover:text-foreground">
          {t("auth.legal.privacyPolicy")}
        </Link>{" "}
        {t("auth.legal.separator")}{" "}
        <Link to="/terms" className="underline hover:text-foreground">
          {t("auth.legal.terms")}
        </Link>
      </p>
    </div>
  );
};

export default SignUpPage;
