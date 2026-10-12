import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { GraduationCap, User } from "lucide-react";
import { COUNTRIES, countryName, isUnderSignupAge } from "@levelup/config";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/auth/AuthContext";
import { socialLandingPath } from "@/auth/socialLanding";
import { completeSocialSignUp, getMe } from "@/api/auth";
import { cn } from "@/lib/utils";

type Role = "coach" | "student";
type Field = "role" | "birthDate" | "country" | "terms";
type FieldErrors = Partial<Record<Field, string>>;
type State = { signupTicket: string; name: string; email: string };

/** auth.register rule 18: the server's codes, in the form's own words (same copy as SignUpPage). */
const CODE_KEYS: Record<string, string> = {
  BIRTH_DATE_REQUIRED: "birthDateRequired",
  INVALID_BIRTH_DATE: "birthDateInvalid",
  COUNTRY_REQUIRED: "countryRequired",
  INVALID_COUNTRY: "countryRequired",
  UNDERAGE: "birthDateUnderage",
  TERMS_REQUIRED: "termsRequired",
};

/**
 * auth.social-sign-in rules 4 and 7 (PAD-618): the short completion step for a person whose
 * Google account has no LevApp account yet. The ticket arrives in router state; nothing is
 * stored until they submit.
 */
const SocialSignUpCompletePage = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { login } = useAuth();
  const location = useLocation();
  const state = location.state as Partial<State> | null;
  const ticket = state?.signupTicket;

  const [role, setRole] = useState<Role>("student");
  const [birthDate, setBirthDate] = useState("");
  const [country, setCountry] = useState("PT");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [expired, setExpired] = useState(false);

  if (!ticket || expired) {
    return (
      <Shell>
        <div className="space-y-3 text-center" data-testid="social-complete-expired">
          <p className="text-sm text-muted-foreground">{t("auth.social.complete.expired")}</p>
          <Link to="/signup" className="underline hover:text-foreground">
            {t("auth.social.complete.backToSignup")}
          </Link>
        </div>
      </Shell>
    );
  }

  const validate = () => {
    const next: FieldErrors = {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) next.birthDate = t("auth.signup.birthDateRequired");
    else if (Number.isNaN(Date.parse(birthDate)) || new Date(`${birthDate}T00:00:00`) > new Date())
      next.birthDate = t("auth.signup.birthDateInvalid");
    else if (isUnderSignupAge(birthDate)) next.birthDate = t("auth.signup.birthDateUnderage");
    if (country.length !== 2) next.country = t("auth.signup.countryRequired");
    if (!termsAccepted) next.terms = t("auth.signup.termsRequired");
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await completeSocialSignUp({ signupTicket: ticket, role, birthDate, country, termsAccepted: true });
      await login(res.accessToken);
      const me = await getMe();
      toast({
        title: t("auth.signup.welcomeTitle"),
        description: role === "coach" ? t("auth.signup.welcomeCoachDescription") : t("auth.signup.welcomeStudentDescription"),
      });
      navigate(socialLandingPath(me), { replace: true });
    } catch (err: unknown) {
      const res = (err as { response?: { status?: number; data?: { error?: string; field?: string; code?: string } } })
        .response;
      const data = res?.data;
      if (res?.status === 401 && data?.error === "INVALID_SIGNUP_TICKET") {
        setExpired(true);
      } else if (res?.status === 400 && data?.field && ["role", "birthDate", "country", "terms"].includes(data.field)) {
        const key = data.code ? CODE_KEYS[data.code] : undefined;
        setErrors((prev) => ({
          ...prev,
          [data.field as Field]: key ? t(`auth.signup.${key}`) : (data.error ?? t("auth.social.complete.failed")),
        }));
      } else if (res?.status === 409 && data?.error === "ALREADY_COMPLETED") {
        toast({ variant: "destructive", title: t("auth.signup.failedTitle"), description: t("auth.social.complete.alreadyCompleted") });
        navigate("/auth", { replace: true });
      } else if (res?.status === 409) {
        toast({ variant: "destructive", title: t("auth.signup.failedTitle"), description: t("auth.signup.emailTaken") });
      } else {
        toast({
          variant: "destructive",
          title: t("auth.signup.failedTitle"),
          description: res ? t("auth.social.complete.failed") : t("auth.login.networkError"),
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
      data-testid={`social-complete-role-${value}`}
      onClick={() => setRole(value)}
      className={cn(
        "flex flex-1 flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
        role === value ? "border-primary bg-primary/10" : "border-border hover:bg-muted",
      )}
    >
      <span className="flex items-center gap-2 font-medium">
        {icon}
        {label}
      </span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  );

  const err = (field: Field) =>
    errors[field] && (
      <p className="text-sm text-destructive" data-testid={`social-complete-${field}-error`}>
        {errors[field]}
      </p>
    );

  return (
    <Shell>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate data-testid="social-complete">
        <div className="space-y-1 rounded-md border p-3 text-sm">
          <p className="font-medium" data-testid="social-complete-name">{state?.name}</p>
          <p className="text-muted-foreground" data-testid="social-complete-email">{state?.email}</p>
        </div>

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
          {role === "coach" && <p className="text-xs text-muted-foreground">{t("auth.signup.coachApprovalNote")}</p>}
          {err("role")}
        </div>

        <div className="space-y-2">
          <Label htmlFor="social-complete-birthDate">{t("auth.signup.birthDate")}</Label>
          <Input
            id="social-complete-birthDate"
            data-testid="social-complete-birthDate"
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            value={birthDate}
            onChange={(e) => {
              setBirthDate(e.target.value);
              setErrors((p) => ({ ...p, birthDate: undefined }));
            }}
          />
          {err("birthDate")}
        </div>

        <div className="space-y-2">
          <Label htmlFor="social-complete-country">{t("auth.signup.country")}</Label>
          <Select
            value={country}
            onValueChange={(v) => {
              setCountry(v);
              setErrors((p) => ({ ...p, country: undefined }));
            }}
          >
            <SelectTrigger id="social-complete-country" data-testid="social-complete-country">
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
          {err("country")}
        </div>

        <div className="space-y-1">
          <div className="flex items-start gap-2">
            <Checkbox
              id="social-complete-terms"
              data-testid="social-complete-terms"
              checked={termsAccepted}
              aria-invalid={errors.terms ? true : undefined}
              onCheckedChange={(next) => {
                setTermsAccepted(next === true);
                setErrors((p) => ({ ...p, terms: undefined }));
              }}
            />
            <label htmlFor="social-complete-terms" className="text-sm leading-snug">
              {t("auth.signup.termsAcceptPrefix")}{" "}
              <Link to="/privacy" target="_blank" className="underline hover:text-foreground">
                {t("auth.legal.privacyPolicy")}
              </Link>{" "}
              {t("auth.signup.termsAcceptJoin")}{" "}
              <Link to="/terms" target="_blank" className="underline hover:text-foreground">
                {t("auth.legal.terms")}
              </Link>
            </label>
          </div>
          {err("terms")}
        </div>

        <Button type="submit" className="w-full" disabled={submitting} data-testid="social-complete-submit">
          {submitting ? t("auth.social.complete.submitting") : t("auth.social.complete.submit")}
        </Button>
      </form>
    </Shell>
  );
};

function Shell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <img src="/brand/levapp-lockup-on-light.svg" alt="LevApp" className="mb-8 h-12 w-auto dark:hidden" />
      <img src="/brand/levapp-lockup-on-dark.svg" alt="LevApp" className="mb-8 hidden h-12 w-auto dark:block" />
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">{t("auth.social.complete.title")}</CardTitle>
          <CardDescription className="text-center">{t("auth.social.complete.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}

export default SocialSignUpCompletePage;
