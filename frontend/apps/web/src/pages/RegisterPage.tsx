import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
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
import { registerUser, activateAccount } from "@/api/register";

type RegistrationStatus = "loading" | "ok" | "already-registered" | "invalid";

const registerSchema = z
  .object({
    name: z.string().min(2, "nameMin"),
    username: z.string().min(3, "usernameMin"),
    email: z.string().email("emailInvalid"),
    phone: z.string().optional(),
    password: z.string().min(6, "passwordMin"),
    repeatPassword: z.string(),
  })
  .refine((data) => data.password === data.repeatPassword, {
    message: "passwordsMismatch",
    path: ["repeatPassword"],
  });

const RegisterPage = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<RegistrationStatus>("loading");

  const [form, setForm] = useState({
    name: "",
    username: "",
    email: "",
    phone: "",
    password: "",
    repeatPassword: "",
  });

  useEffect(() => {
    if (!userId) return;

    const fetchUser = async () => {
      try {
        const data = await registerUser(userId);

        if (data.isActive) {
          setStatus("already-registered");
          return;
        }

        setForm((prev) => ({
          ...prev,
          name: data.name ?? "",
          username: data.username ?? "",
          email: data.email ?? "",
          phone: data.phone ?? "",
        }));
      } catch {
        toast({
          variant: "destructive",
          title: t("auth.register.invalidLinkTitle"),
          description: t("auth.register.invalidLinkDescription"),
        });
        navigate("/auth");
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [userId, navigate, toast]);

  const validateForm = () => {
    const result = registerSchema.safeParse(form);

    if (!result.success) {
      const newErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        newErrors[err.path[0]] = t(`auth.register.${err.message}`);
      });
      setErrors(newErrors);
      return false;
    }

    setErrors({});
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !validateForm()) return;

    setSubmitting(true);

    try {
      await activateAccount({
        userId,
        content: {
          name: form.name,
          username: form.username,
          email: form.email,
          phone: form.phone,
          password: form.password,
        },
      });

      toast({
        title: t("auth.register.activatedTitle"),
        description: t("auth.register.activatedDescription"),
      });

      navigate("/auth");
    } catch {
      toast({
        variant: "destructive",
        title: t("auth.register.failedTitle"),
        description: t("auth.register.failedDescription"),
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  if (status === "already-registered") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">
              {t("auth.register.alreadyRegisteredTitle")}
            </CardTitle>
            <CardDescription>
              {t("auth.register.alreadyRegisteredDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate("/auth")}>
              {t("auth.register.goToLogin")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-destructive">
              {t("auth.register.invalidTitle")}
            </CardTitle>
            <CardDescription>
              {t("auth.register.invalidDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate("/auth")}>
              {t("auth.register.goBack")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            {t("auth.register.title")}
          </CardTitle>
          <CardDescription className="text-center">
            {t("auth.register.description")}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {[
              { id: "name", label: t("auth.register.name") },
              { id: "username", label: t("auth.register.username") },
              { id: "email", label: t("auth.register.email") },
              { id: "phone", label: t("auth.register.phone") },
              { id: "password", label: t("auth.register.password"), type: "password" },
              {
                id: "repeatPassword",
                label: t("auth.register.repeatPassword"),
                type: "password",
              },
            ].map(({ id, label, type = "text" }) => (
              <div key={id} className="space-y-2">
                <Label htmlFor={id}>{label}</Label>
                <Input
                  id={id}
                  type={type}
                  value={(form as any)[id]}
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

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? t("auth.register.activating") : t("auth.register.activate")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="mt-4 text-center text-xs text-muted-foreground">
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

export default RegisterPage;
