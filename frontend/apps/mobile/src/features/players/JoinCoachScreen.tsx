import { joinTokensApi } from "@levelup/api";
import { router } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { rememberPendingJoin } from "@/auth/pendingJoin";
import { PreAuthShell, WelcomeBand } from "@/features/auth/PreAuthShell";
import { Button } from "@/components/ui/button";
import { Ionicons } from "@expo/vector-icons";
import { lightTheme } from "@levelup/config";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";

type Status = "loading" | "invalid" | "preview" | "joining" | "joined";

/**
 * `/join/coach/:token` on iOS — players.join-token rule 9. Same four states as
 * web's JoinCoachPage: signed-out (remember the token, go to login/signup),
 * coach account (cannot join), preview + confirm, success.
 */
export function JoinCoachScreen({ token }: { token: string | null }) {
  const { t } = useTranslation();
  const { user, isAuthenticated, loading: authLoading, refreshUser } = useAuth();
  const [status, setStatus] = React.useState<Status>(token ? "loading" : "invalid");
  const [preview, setPreview] = React.useState<joinTokensApi.JoinTokenPreview | null>(null);
  const [result, setResult] = React.useState<joinTokensApi.AcceptJoinTokenResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await joinTokensApi.previewJoinToken(token);
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

  const goToAuth = (route: "/login" | "/signup") => {
    if (token) rememberPendingJoin(token);
    router.replace(route);
  };

  const handleJoin = async () => {
    if (!token) return;
    setStatus("joining");
    setError(null);
    try {
      const res = await joinTokensApi.acceptJoinToken(token);
      // players.join-token rule 8a (PAD-444): the student is linked now, so re-read /me before the
      // dashboard can show "No coach yet?" from the copy loaded at sign-up. Never fails the join.
      await refreshUser().catch(() => null);
      setResult(res);
      setStatus("joined");
    } catch (err) {
      const code = (err as { response?: { status?: number } }).response?.status;
      if (code === 404 || code === 410) {
        setStatus("invalid");
      } else {
        setError(t("players.joinCoach.failed"));
        setStatus("preview");
      }
    }
  };

  // auth.invite-welcome: every state but loading and invalid puts its words on the navy band, outside the card.
  const shell = (children: React.ReactNode, testID: string) => (
    <PreAuthShell testID="join-coach-screen">
      <Card testID={testID}>{children}</Card>
    </PreAuthShell>
  );
  const welcome = (
    band: { title: string; description: string; names?: { coach: string; club: string } },
    children: React.ReactNode,
    testID: string
  ) => (
    <PreAuthShell testID="join-coach-screen">
      <WelcomeBand {...band} />
      <Card testID={testID}>
        <CardContent className="gap-3 pt-6">{children}</CardContent>
      </Card>
    </PreAuthShell>
  );

  const icon = (name: React.ComponentProps<typeof Ionicons>["name"]) => (
    <View className="mb-2 h-12 w-12 items-center justify-center rounded-full bg-primary/10">
      <Ionicons name={name} size={24} color={lightTheme.primary} />
    </View>
  );

  if (status === "loading" || authLoading) {
    return shell(
      <CardContent className="items-center py-10">
        <Spinner />
        <Text className="mt-2 text-sm text-muted-foreground">{t("players.joinCoach.loading")}</Text>
      </CardContent>,
      "join-coach-loading"
    );
  }

  if (status === "invalid" || !preview) {
    return shell(
      <>
        <CardHeader className="items-center">
          {icon("close-circle-outline")}
          <CardTitle className="text-center">{t("players.joinCoach.invalidTitle")}</CardTitle>
          <CardDescription className="text-center">{t("players.joinCoach.invalidDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            testID="join-coach-back"
            onPress={() => router.replace(isAuthenticated ? "/(tabs)/dashboard" : "/login")}
          >
            <Text>{isAuthenticated ? t("players.connect.goToDashboard") : t("players.joinCoach.signIn")}</Text>
          </Button>
        </CardContent>
      </>,
      "join-coach-invalid"
    );
  }

  if (!isAuthenticated) {
    return welcome(
      {
        title: t("players.joinCoach.signInTitle", { coach: preview.coachName }),
        description: t("players.joinCoach.signInDescription"),
        names: { coach: preview.coachName, club: preview.clubName },
      },
      <>
        <Button testID="join-coach-create-account" onPress={() => goToAuth("/signup")} className="min-h-11">
          <Text>{t("players.joinCoach.createAccount")}</Text>
        </Button>
        <Button variant="outline" testID="join-coach-sign-in" onPress={() => goToAuth("/login")} className="min-h-11">
          <Text>{t("players.joinCoach.signIn")}</Text>
        </Button>
      </>,
      "join-coach-signed-out"
    );
  }

  if (isCoach) {
    return welcome(
      { title: t("players.joinCoach.coachTitle"), description: t("players.joinCoach.coachDescription") },
      <Button variant="outline" onPress={() => router.replace("/(tabs)/dashboard")} className="min-h-11">
        <Text>{t("players.connect.goToDashboard")}</Text>
      </Button>,
      "join-coach-is-coach"
    );
  }

  if (status === "joined" && result) {
    return welcome(
      {
        title: t("players.joinCoach.successTitle", { coach: result.coachName }),
        description: result.alreadyMember
          ? t("players.joinCoach.alreadyMember", { coach: result.coachName })
          : t("players.joinCoach.successDescription", { coach: result.coachName, club: result.clubName }),
      },
      <Button testID="join-coach-go-calendar" onPress={() => router.replace("/(tabs)/calendar")} className="min-h-11">
        <Text>{t("players.joinCoach.goToCalendar")}</Text>
      </Button>,
      "join-coach-success"
    );
  }

  return welcome(
    {
      title: t("players.joinCoach.prompt", { coach: preview.coachName, club: preview.clubName }),
      description: t("players.joinCoach.explain", { coach: preview.coachName }),
      names: { coach: preview.coachName, club: preview.clubName },
    },
    <>
      {error ? (
        <Text className="text-center text-sm text-destructive" testID="join-coach-error">
          {error}
        </Text>
      ) : null}
      <Button testID="join-coach-confirm" disabled={status === "joining"} onPress={handleJoin} className="min-h-11">
        <Text>{status === "joining" ? t("players.joinCoach.joining") : t("players.joinCoach.confirm")}</Text>
      </Button>
      <Button variant="ghost" onPress={() => router.replace("/(tabs)/dashboard")} className="min-h-11">
        <Text>{t("players.connect.goToDashboard")}</Text>
      </Button>
    </>,
    "join-coach-preview"
  );
}
