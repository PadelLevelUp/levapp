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
  })
  .refine((d) => d.password === d.repeatPassword, {
    message: "passwordsMismatch",
    path: ["repeatPassword"],
  });

type FieldErrors = Partial<Record<"name" | "username" | "email" | "password" | "repeatPassword", string>>;

const SignUpPage = () => {
  const { t } = useTranslation();
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
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const setField = (field: keyof typeof form, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const validate = () => {
    const result = signUpSchema.safeParse(form);
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
      });
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
      const data = (err as { response?: { status?: number; data?: { error?: string; field?: string } } })
        .response;
      if (data?.status === 409 && (data.data?.field === "username" || data.data?.field === "email")) {
        const field = data.data.field;
        setErrors((prev) => ({
          ...prev,
          [field]: field === "username" ? t("auth.signup.usernameTaken") : t("auth.signup.emailTaken"),
        }));
      } else if (data?.status === 400 && data.data?.field) {
        setErrors((prev) => ({ ...prev, [data.data!.field as keyof FieldErrors]: data.data?.error }));
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

            <Button type="submit" className="w-full" disabled={submitting} data-testid="signup-submit">
              {submitting ? t("auth.signup.creating") : t("auth.signup.create")}
            </Button>
          </form>

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
