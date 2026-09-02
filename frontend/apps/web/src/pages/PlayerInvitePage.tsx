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
import {
  getPlayerInvitation,
  acceptPlayerInvitation,
} from "@/api/playerInvitations";
import { useAuth } from "@/auth/AuthContext";

type InvitationStatus = "loading" | "valid" | "invalid";

const acceptSchema = z
  .object({
    username: z.string().min(3, "usernameMin"),
    password: z.string().min(6, "passwordMin"),
    repeatPassword: z.string(),
  })
  .refine((data) => data.password === data.repeatPassword, {
    message: "passwordsMismatch",
    path: ["repeatPassword"],
  });

const PlayerInvitePage = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { login } = useAuth();
  const { t } = useTranslation();

  const [status, setStatus] = useState<InvitationStatus>("loading");
  const [playerName, setPlayerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [form, setForm] = useState({
    username: "",
    password: "",
    repeatPassword: "",
  });

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }

    const fetchInvitation = async () => {
      try {
        const data = await getPlayerInvitation(token);
        setPlayerName(data.playerName);
        setStatus("valid");
      } catch {
        // 404 (unknown) or 410 (used / expired)
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
        newErrors[String(err.path[0])] = t(`auth.playerInvite.${err.message}`);
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
      const { accessToken } = await acceptPlayerInvitation(token, {
        username: form.username,
        password: form.password,
      });

      toast({
        title: t("auth.playerInvite.welcomeTitle"),
        description: t("auth.playerInvite.welcomeDescription"),
      });

      await login(accessToken);
      navigate("/");
    } catch (error: any) {
      const code = error?.response?.status;
      if (code === 409) {
        setSubmitError(t("auth.playerInvite.usernameTaken"));
      } else if (code === 404 || code === 410) {
        setStatus("invalid");
      } else {
        setSubmitError(t("auth.playerInvite.genericError"));
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
              {t("auth.playerInvite.invalidTitle")}
            </CardTitle>
            <CardDescription>
              {t("auth.playerInvite.invalidDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate("/auth")}>
              {t("auth.playerInvite.goToLogin")}
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
            {t("auth.playerInvite.title", { playerName })}
          </CardTitle>
          <CardDescription className="text-center">
            {t("auth.playerInvite.description")}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { id: "username", label: t("auth.playerInvite.username") },
              { id: "password", label: t("auth.playerInvite.password"), type: "password" },
              {
                id: "repeatPassword",
                label: t("auth.playerInvite.repeatPassword"),
                type: "password",
              },
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
                  <p className="text-sm text-destructive">{errors[id]}</p>
                )}
              </div>
            ))}

            {submitError && (
              <p className="text-sm text-destructive">{submitError}</p>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? t("auth.playerInvite.completing") : t("auth.playerInvite.complete")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default PlayerInvitePage;
