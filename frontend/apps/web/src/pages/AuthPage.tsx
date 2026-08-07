import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import { usernameSchema, passwordSchema } from "@levelup/validation";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";

const AuthPage = () => {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{
    username?: string;
    password?: string;
  }>({});

  const navigate = useNavigate();
  const { toast } = useToast();

  const { login } = useAuth();

  const validateForm = () => {
    const newErrors: { username?: string; password?: string } = {};

    const usernameResult = usernameSchema.safeParse(username);
    if (!usernameResult.success) {
      newErrors.username = t("auth.login.usernameMin");
    }

    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) {
      newErrors.password = t("auth.login.passwordMin");
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);

    try {
      const res = await api.post("/auth/login", {
        username,
        password,
      });

      await login(res.data.accessToken)
      navigate("/dashboard");
      toast({
        title: t("auth.login.welcomeTitle"),
        description: t("auth.login.welcomeDescription"),
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: t("auth.login.failedTitle"),
        description: t("auth.login.failedDescription"),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      {/* The first screen a user sees carried no branding at all, while every
          in-app screen shows the mark. Mark + wordmark: this is the one place
          with room for the full lockup. A static SVG cannot follow the theme,
          so both variants ship and CSS picks. */}
      <div className="mb-8 flex items-center gap-3" aria-label="LevApp">
        <img
          src="/brand/levapp-mark-on-light.svg"
          alt=""
          aria-hidden="true"
          className="h-10 w-auto dark:hidden"
        />
        <img
          src="/brand/levapp-mark-on-dark.svg"
          alt=""
          aria-hidden="true"
          className="hidden h-10 w-auto dark:block"
        />
        <img
          src="/brand/levapp-wordmark-on-light.svg"
          alt=""
          aria-hidden="true"
          className="h-6 w-auto dark:hidden"
        />
        <img
          src="/brand/levapp-wordmark-on-dark.svg"
          alt=""
          aria-hidden="true"
          className="hidden h-6 w-auto dark:block"
        />
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            {t("auth.login.title")}
          </CardTitle>
          <CardDescription className="text-center">
            {t("auth.login.description")}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">{t("auth.login.username")}</Label>
              <Input
                id="username"
                type="text"
                placeholder={t("auth.login.usernamePlaceholder")}
                autoCapitalize="none"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setErrors((prev) => ({ ...prev, username: undefined }));
                }}
              />
              {errors.username && (
                <p className="text-sm text-destructive">
                  {errors.username}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.login.password")}</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrors((prev) => ({ ...prev, password: undefined }));
                }}
              />
              {errors.password && (
                <p className="text-sm text-destructive">
                  {errors.password}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("auth.login.signingIn") : t("auth.login.signIn")}
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

export default AuthPage;
