import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { isUnderSignupAge } from "@levelup/config";

/** PAD-457: the server's birth-date codes, in this form's own words. */
const BIRTH_CODE_KEYS: Record<string, string> = {
  BIRTH_DATE_REQUIRED: "birthDateRequired",
  INVALID_BIRTH_DATE: "birthDateInvalid",
  UNDERAGE: "birthDateUnderage",
};
import { getCoachInvitation, acceptCoachInvitation } from "@/api/invitations";
import { useAuth } from "@/auth/AuthContext";

type InvitationStatus = "loading" | "valid" | "invalid";

const acceptSchema = z
  .object({
    name: z.string().min(2, "nameMin"),
    username: z.string().min(3, "usernameMin"),
    password: z.string().min(6, "passwordMin"),
    repeatPassword: z.string(),
    // PAD-457: adults only — this form creates a login.
    birthDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "birthDateRequired")
      .refine((d) => !Number.isNaN(Date.parse(d)) && new Date(`${d}T00:00:00`) <= new Date(), "birthDateInvalid")
      .refine((d) => !isUnderSignupAge(d), "birthDateUnderage"),
  })
  .refine((data) => data.password === data.repeatPassword, {
    message: "passwordsMismatch",
    path: ["repeatPassword"],
  });

const CoachInvitePage = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { login } = useAuth();
  const { t } = useTranslation();

  const [status, setStatus] = useState<InvitationStatus>("loading");
  const [clubName, setClubName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    username: "",
    password: "",
    repeatPassword: "",
    birthDate: "",
  });

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }

    const fetchInvitation = async () => {
      try {
        const data = await getCoachInvitation(token);
        setClubName(data.clubName);
        setStatus("valid");
      } catch {
        // 404 (unknown) or 410 (used / revoked / expired)
        setStatus("invalid");
      }
    };

    fetchInvitation();
  }, [token]);

  const validateForm = () => {
    const result = acceptSchema.safeParse(form);

    if (!result.success) {
      const newErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        newErrors[String(err.path[0])] = t(`auth.coachInvite.${err.message}`);
      });
      setErrors(newErrors);
      return false;
    }

    setErrors({});
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !validateForm()) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const { accessToken } = await acceptCoachInvitation(token, {
        name: form.name,
        username: form.username,
        password: form.password,
        birthDate: form.birthDate,
      });

      toast({
        title: t("auth.coachInvite.welcomeTitle"),
        description: t("auth.coachInvite.welcomeDescription", { clubName }),
      });

      await login(accessToken);
      navigate("/");
    } catch (error: any) {
      const code = error?.response?.status;
      // PAD-457: a birth-date refusal belongs on the field, in the form's words.
      const birthKey = BIRTH_CODE_KEYS[error?.response?.data?.code ?? ""];
      if (code === 400 && error?.response?.data?.field === "birthDate" && birthKey) {
        setErrors((prev) => ({ ...prev, birthDate: t(`auth.coachInvite.${birthKey}`) }));
        return;
      }
      if (code === 409) {
        setSubmitError(t("auth.coachInvite.usernameTaken"));
      } else if (code === 404 || code === 410) {
        setStatus("invalid");
      } else {
        setSubmitError(t("auth.coachInvite.genericError"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading") return null;

  if (status === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-destructive">
              {t("auth.coachInvite.invalidTitle")}
            </CardTitle>
            <CardDescription>
              {t("auth.coachInvite.invalidDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate("/auth")}>
              {t("auth.coachInvite.goToLogin")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            {t("auth.coachInvite.title", { clubName })}
          </CardTitle>
          <CardDescription className="text-center">
            {t("auth.coachInvite.description")}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { id: "name", label: t("auth.coachInvite.name") },
              { id: "username", label: t("auth.coachInvite.username") },
              { id: "password", label: t("auth.coachInvite.password"), type: "password" },
              {
                id: "repeatPassword",
                label: t("auth.coachInvite.repeatPassword"),
                type: "password",
              },
              { id: "birthDate", label: t("auth.coachInvite.birthDate"), type: "date" },
            ].map(({ id, label, type = "text" }) => (
              <div key={id} className="space-y-2">
                <Label htmlFor={id}>{label}</Label>
                <Input
                  id={id}
                  type={type}
                  value={form[id as keyof typeof form]}
                  onChange={(e) => {
                    setForm((prev) => ({
                      ...prev,
                      [id]: e.target.value,
                    }));
                    setErrors((prev) => ({ ...prev, [id]: undefined }));
                  }}
                />
                {errors[id] && (
                  <p className="text-sm text-destructive" data-testid={`coachInvite-${id}-error`}>{errors[id]}</p>
                )}
              </div>
            ))}

            {submitError && (
              <p className="text-sm text-destructive">{submitError}</p>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? t("auth.coachInvite.joining") : t("auth.coachInvite.join")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default CoachInvitePage;
