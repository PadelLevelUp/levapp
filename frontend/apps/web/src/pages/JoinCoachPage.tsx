import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InviteWelcome } from "@/components/auth/InviteWelcome";
import { useAuth } from "@/auth/AuthContext";
import { rememberPostAuthRedirect } from "@/auth/postAuthRedirect";
import {
  acceptJoinToken,
  previewJoinToken,
  type AcceptJoinTokenResponse,
  type JoinTokenPreview,
} from "@/api/joinTokens";

type Status = "loading" | "invalid" | "preview" | "joining" | "joined";

/**
 * players.join-token rule 9 — `/join/coach/:token`, the page a student lands on
 * after scanning the coach's QR or opening the link.
 *
 * Public route: the preview is public, so the page can tell a signed-out
 * visitor who they are about to join before sending them to sign in or sign
 * up; the accept call needs the session, and the redirect helper brings them
 * straight back here afterwards.
 */
const JoinCoachPage = () => {
  const { t } = useTranslation();
  const { token = "" } = useParams<{ token: string }>();
  const { user, isAuthenticated, loading: authLoading, refreshUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [status, setStatus] = useState<Status>("loading");
  const [preview, setPreview] = useState<JoinTokenPreview | null>(null);
  const [result, setResult] = useState<AcceptJoinTokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setStatus("invalid");
      return;
    }
    (async () => {
      try {
        const data = await previewJoinToken(token);
        if (!cancelled) {
          setPreview(data);
          setStatus("preview");
        }
      } catch {
        if (!cancelled) setStatus("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const isCoach = user?.roles?.includes("coach") ?? false;

  const goToAuth = (path: "/auth" | "/signup") => {
    rememberPostAuthRedirect(location.pathname);
    navigate(path);
  };

  const handleJoin = async () => {
    setStatus("joining");
    setError(null);
    try {
      const res = await acceptJoinToken(token);
      // players.join-token rule 8a (PAD-444): the student is linked now, so re-read /me before the
      // dashboard can show "No coach yet?" from the copy loaded at sign-up. Never fails the join.
      await refreshUser().catch(() => null);
      setResult(res);
      setStatus("joined");
    } catch (err) {
      const statusCode = (err as { response?: { status?: number } }).response?.status;
      if (statusCode === 404 || statusCode === 410) {
        setStatus("invalid");
      } else {
        setError(t("players.joinCoach.failed"));
        setStatus("preview");
      }
    }
  };

  const shell = (children: React.ReactNode, testId: string) => (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <img src="/brand/levapp-lockup-on-light.svg" alt="LevApp" className="mb-8 h-12 w-auto dark:hidden" />
      <img src="/brand/levapp-lockup-on-dark.svg" alt="LevApp" className="mb-8 hidden h-12 w-auto dark:block" />
      <Card className="w-full max-w-md" data-testid={testId}>
        {children}
      </Card>
    </div>
  );

  if (status === "loading" || authLoading) {
    return shell(
      <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("players.joinCoach.loading")}
      </CardContent>,
      "join-coach-loading"
    );
  }

  if (status === "invalid" || !preview) {
    return shell(
      <>
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <XCircle className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-bold">{t("players.joinCoach.invalidTitle")}</CardTitle>
          <CardDescription>{t("players.joinCoach.invalidDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="w-full">
            <Link to={isAuthenticated ? "/dashboard" : "/auth"}>
              {isAuthenticated ? t("players.connect.goToDashboard") : t("players.joinCoach.signIn")}
            </Link>
          </Button>
        </CardContent>
      </>,
      "join-coach-invalid"
    );
  }

  if (!isAuthenticated) {
    return (
      <InviteWelcome
        testId="join-coach-signed-out"
        names={{ coach: preview.coachName, club: preview.clubName }}
        title={t("players.joinCoach.signInTitle", { coach: preview.coachName })}
        description={t("players.joinCoach.signInDescription")}
      >
        <Button className="w-full min-h-11" onClick={() => goToAuth("/signup")} data-testid="join-coach-create-account">
          {t("players.joinCoach.createAccount")}
        </Button>
        <Button variant="outline" className="w-full min-h-11" onClick={() => goToAuth("/auth")} data-testid="join-coach-sign-in">
          {t("players.joinCoach.signIn")}
        </Button>
      </InviteWelcome>
    );
  }

  if (isCoach) {
    return (
      <InviteWelcome
        testId="join-coach-is-coach"
        title={t("players.joinCoach.coachTitle")}
        description={t("players.joinCoach.coachDescription")}
      >
        <Button asChild variant="outline" className="w-full min-h-11">
          <Link to="/dashboard">{t("players.connect.goToDashboard")}</Link>
        </Button>
      </InviteWelcome>
    );
  }

  if (status === "joined" && result) {
    return (
      <InviteWelcome
        testId="join-coach-success"
        title={t("players.joinCoach.successTitle", { coach: result.coachName })}
        description={
          result.alreadyMember
            ? t("players.joinCoach.alreadyMember", { coach: result.coachName })
            : t("players.joinCoach.successDescription", { coach: result.coachName, club: result.clubName })
        }
      >
        <Button asChild className="w-full min-h-11" data-testid="join-coach-go-calendar">
          <Link to="/calendar">{t("players.joinCoach.goToCalendar")}</Link>
        </Button>
      </InviteWelcome>
    );
  }

  return (
    <InviteWelcome
      testId="join-coach-preview"
      names={{ coach: preview.coachName, club: preview.clubName, logoUrl: preview.clubLogoUrl }}
      title={t("players.joinCoach.prompt", { coach: preview.coachName, club: preview.clubName })}
      description={t("players.joinCoach.explain", { coach: preview.coachName })}
    >
      {error && (
        <p className="text-center text-sm text-destructive" data-testid="join-coach-error">
          {error}
        </p>
      )}
      <Button
        className="w-full min-h-11"
        onClick={handleJoin}
        disabled={status === "joining"}
        data-testid="join-coach-confirm"
      >
        {status === "joining" ? t("players.joinCoach.joining") : t("players.joinCoach.confirm")}
      </Button>
      <Button asChild variant="ghost" className="w-full min-h-11">
        <Link to="/dashboard">{t("players.connect.goToDashboard")}</Link>
      </Button>
    </InviteWelcome>
  );
};

export default JoinCoachPage;
