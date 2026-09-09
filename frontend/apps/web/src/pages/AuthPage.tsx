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
import { useLaunchOverlay } from "@/components/brand/launch-overlay";
import { postLoginLanding } from "@/auth/postLoginPath";
import { getMe } from "@/api/auth";
import { consumePostAuthRedirect } from "@/auth/postAuthRedirect";

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
  const { begin, succeed, cancel } = useLaunchOverlay();

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
    // Cover the screen before the request goes out, not after it comes back —
    // the mark forming IS the wait. The overlay lives above the router
    // (LaunchOverlayProvider), so the navigate below happens underneath it and
    // the dashboard is already fetching by the time the reveal plays.
    begin();

    try {
      const res = await api.post("/auth/login", {
        username,
        password,
      });

      await login(res.data.accessToken)
      // auth.register rule 11: a coach still waiting for approval, or with no
      // club yet, lands on the screen that says so rather than the dashboard.
      // players.join-token rule 9: a join link opened without a session comes
      // first, once the account is usable for it.
      const me = await getMe();
      const target = postLoginLanding(me);
      const remembered = consumePostAuthRedirect();
      // A remembered post-auth path (invite / join link) wins over both the
      // dashboard and the "connect with a coach" landing — the link IS the
      // connection the student came for. Coach gates (pending, no club) still win.
      const gated = target !== "/dashboard" && target !== "/connect";
      navigate(remembered && !gated ? remembered : target);
      succeed();
      toast({
        title: t("auth.login.welcomeTitle"),
        description: t("auth.login.welcomeDescription"),
      });
    } catch (err) {
      // Take the overlay away at once; the error toast is behind it.
      cancel();
      // auth.login rule 7 (PAD-228): a throttled attempt says when to retry.
      const res = (err as { response?: { status?: number; data?: { retryAfterSeconds?: number } } }).response;
      toast({
        variant: "destructive",
        title: t("auth.login.failedTitle"),
        description:
          res?.status === 429
            ? t("auth.login.rateLimited", { seconds: res.data?.retryAfterSeconds ?? 60 })
            : t("auth.login.failedDescription"),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      {/* The design system ships a LOCKUP with the mark pre-scaled and set
          against the wordmark's baseline, clear space included. Composing the
          two images by hand and eyeballing a gap got the alignment wrong. */}
      <img
        src="/brand/levapp-lockup-on-light.svg"
        alt="LevApp"
        className="mb-8 h-12 w-auto dark:hidden"
      />
      <img
        src="/brand/levapp-lockup-on-dark.svg"
        alt="LevApp"
        className="mb-8 hidden h-12 w-auto dark:block"
      />

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

          {/* auth.login rule 6 / auth.password-recovery rule 7 — the recovery entry point. */}
          <p className="mt-3 text-center text-sm">
            <Link to="/forgot-password" className="text-muted-foreground underline hover:text-foreground" data-testid="auth-forgot-password">
              {t("auth.login.forgotPassword")}
            </Link>
          </p>

          {/* auth.register rule 10 — the signup entry point lives on the login screen. */}
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t("auth.login.noAccount")}{" "}
            <Link to="/signup" className="underline hover:text-foreground" data-testid="auth-create-account">
              {t("auth.login.createAccount")}
            </Link>
          </p>
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
