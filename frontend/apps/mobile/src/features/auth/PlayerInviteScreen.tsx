import { playerInvitationsApi } from "@levelup/api";
import { router } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { rememberPendingClaim } from "@/auth/pendingClaim";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { toast } from "@/components/ui/toast";
import { PreAuthShell } from "@/features/auth/AccountSetupScreen";
import {
  AccountSetupForm,
  AccountSetupLoading,
  AccountSetupNotice,
  type AccountFormField,
} from "@/features/auth/AccountSetupScreen";
import {
  playerInviteSchema,
  statusFromError,
  submitOutcomeForError,
  validateAccountForm,
} from "@/features/auth/account-setup";

type Status = "loading" | "valid" | "invalid";
/** players.claim trigger A — the signed-in student takes the record over. */
type ClaimStatus = "idle" | "claiming" | "claimed";

/**
 * `/invite/player/:token` on iOS — the native twin of web's `PlayerInvitePage`
 * (PAD-164). The common case of the three: a coach adds a player to the roster,
 * the player gets a link, and this is where they choose a username and password
 * and end up signed in.
 *
 * Unauthenticated by design. The two API calls (`GET` the invitation, `POST`
 * accept) are public endpoints, and the screen is not behind the tab navigator,
 * so a cold launch straight onto this route works with no session.
 *
 * Accepting returns an access token, so the flow finishes *inside* the app:
 * `login()` persists it and hydrates the user, and the player lands on the
 * dashboard rather than back on a sign-in form retyping what they just chose.
 */
export function PlayerInviteScreen({ token }: { token: string | null }) {
  const { t } = useTranslation();
  const { login, user, isAuthenticated, loading: authLoading } = useAuth();
  const [claimStatus, setClaimStatus] = React.useState<ClaimStatus>("idle");
  const [claimError, setClaimError] = React.useState<string | null>(null);
  const [claimedCoach, setClaimedCoach] = React.useState("");

  const [status, setStatus] = React.useState<Status>(
    token ? "loading" : "invalid"
  );
  const [playerName, setPlayerName] = React.useState("");
  const [values, setValues] = React.useState({
    username: "",
    password: "",
    repeatPassword: "",
  });
  const [errors, setErrors] = React.useState<Record<string, string | undefined>>(
    {}
  );
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await playerInvitationsApi.getPlayerInvitation(token);
        if (cancelled) return;
        setPlayerName(data.playerName);
        setStatus("valid");
      } catch {
        // 404 (unknown) or 410 (used / revoked / expired) — same dead end.
        if (!cancelled) setStatus("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const goToLogin = React.useCallback(() => {
    router.replace("/login");
  }, []);

  const onChangeField = React.useCallback((id: string, value: string) => {
    setValues((prev) => ({ ...prev, [id]: value }));
    setErrors((prev) => ({ ...prev, [id]: undefined }));
  }, []);

  const handleSubmit = React.useCallback(async () => {
    if (!token) return;
    setSubmitError(null);

    const codes = validateAccountForm(playerInviteSchema, values);
    if (Object.keys(codes).length > 0) {
      const translated: Record<string, string> = {};
      for (const [field, code] of Object.entries(codes)) {
        translated[field] = t(`auth.playerInvite.${code}`);
      }
      setErrors(translated);
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      const { accessToken } = await playerInvitationsApi.acceptPlayerInvitation(
        token,
        { username: values.username, password: values.password }
      );
      toast.success(
        t("auth.playerInvite.welcomeTitle"),
        t("auth.playerInvite.welcomeDescription")
      );
      await login(accessToken);
      router.replace("/(tabs)/dashboard");
    } catch (error) {
      const outcome = submitOutcomeForError(error);
      if (outcome === "username-taken") {
        setSubmitError(t("auth.playerInvite.usernameTaken"));
      } else if (outcome === "invalid-token") {
        setStatus("invalid");
      } else {
        setSubmitError(t("auth.playerInvite.genericError"));
      }
    } finally {
      setSubmitting(false);
    }
  }, [login, t, token, values]);

  // players.claim rule 3: while signed in, offer to link the record instead
  // of asking for a new username and password. Twin of web's PlayerInvitePage.
  const isCoach = user?.roles?.includes("coach") ?? false;

  const handleClaim = React.useCallback(async () => {
    if (!token) return;
    setClaimStatus("claiming");
    setClaimError(null);
    try {
      const { coachName } = await playerInvitationsApi.claimPlayerInvitation(token);
      setClaimedCoach(coachName);
      setClaimStatus("claimed");
    } catch (error) {
      const code = statusFromError(error);
      setClaimStatus("idle");
      if (code === 409) {
        setClaimError(t("auth.playerInvite.claimAlreadyActivated"));
      } else if (code === 404 || code === 410) {
        setStatus("invalid");
      } else {
        setClaimError(t("auth.playerInvite.genericError"));
      }
    }
  }, [t, token]);

  const goSignInToLink = React.useCallback(() => {
    if (token) rememberPendingClaim(token);
    router.replace("/login");
  }, [token]);

  if (status === "loading" || authLoading) {
    return <AccountSetupLoading testID="player-invite-loading" />;
  }

  if (status === "invalid") {
    return (
      <AccountSetupNotice
        testID="player-invite-invalid"
        title={t("auth.playerInvite.invalidTitle")}
        description={t("auth.playerInvite.invalidDescription")}
        actionLabel={t("auth.playerInvite.goToLogin")}
        onAction={goToLogin}
      />
    );
  }

  if (claimStatus === "claimed") {
    return (
      <AccountSetupNotice
        testID="invite-claim-success"
        tone="neutral"
        title={t("auth.playerInvite.claimSuccessTitle")}
        description={t("auth.playerInvite.claimSuccessDescription", { coachName: claimedCoach })}
        actionLabel={t("auth.playerInvite.claimGoToDashboard")}
        onAction={() => router.replace("/(tabs)/dashboard")}
      />
    );
  }

  if (isAuthenticated && isCoach) {
    return (
      <AccountSetupNotice
        testID="invite-claim-is-coach"
        title={t("auth.playerInvite.claimIsCoachTitle")}
        description={t("auth.playerInvite.claimIsCoachDescription")}
        actionLabel={t("auth.playerInvite.claimGoToDashboard")}
        onAction={() => router.replace("/(tabs)/dashboard")}
      />
    );
  }

  if (isAuthenticated) {
    return (
      <PreAuthShell testID="invite-claim">
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-center">{t("auth.playerInvite.claimTitle")}</CardTitle>
            <CardDescription className="text-center">
              {t("auth.playerInvite.claimDescription", { playerName })}
            </CardDescription>
          </CardHeader>
          <CardContent className="gap-3">
            <Text className="text-center text-sm text-muted-foreground">
              {t("auth.playerInvite.claimSignedInAs", { name: user?.name ?? user?.username ?? "" })}
            </Text>
            {claimError ? (
              <Text className="text-center text-sm text-destructive" testID="invite-claim-error">
                {claimError}
              </Text>
            ) : null}
            <Button
              testID="invite-claim-confirm"
              disabled={claimStatus === "claiming"}
              onPress={() => void handleClaim()}
            >
              <Text>
                {claimStatus === "claiming"
                  ? t("auth.playerInvite.claiming")
                  : t("auth.playerInvite.claimConfirm")}
              </Text>
            </Button>
            <Text className="text-center text-xs text-muted-foreground">
              {t("auth.playerInvite.claimUseAnotherAccount")}
            </Text>
          </CardContent>
        </Card>
      </PreAuthShell>
    );
  }

  const fields: AccountFormField[] = [
    {
      id: "username",
      label: t("auth.playerInvite.username"),
      autoComplete: "username-new",
    },
    {
      id: "password",
      label: t("auth.playerInvite.password"),
      secure: true,
      autoComplete: "new-password",
    },
    {
      id: "repeatPassword",
      label: t("auth.playerInvite.repeatPassword"),
      secure: true,
      autoComplete: "new-password",
    },
  ];

  return (
    <View className="flex-1">
      <AccountSetupForm
      testID="player-invite"
      title={t("auth.playerInvite.title", { playerName })}
      description={t("auth.playerInvite.description")}
      fields={fields}
      values={values}
      errors={errors}
      onChangeField={onChangeField}
      onSubmit={() => void handleSubmit()}
      submitLabel={
        submitting
          ? t("auth.playerInvite.completing")
          : t("auth.playerInvite.complete")
      }
      submitting={submitting}
      submitError={submitError}
      />
      {/* players.invite-completion rule 9 / players.claim rule 3: the student
          may already have an account of their own. */}
      <View className="absolute inset-x-0 bottom-8 items-center px-6">
        <Pressable
          testID="invite-claim-signin"
          accessibilityRole="button"
          accessibilityLabel={t("auth.playerInvite.claimSignIn")}
          onPress={goSignInToLink}
        >
          <Text className="text-center text-sm text-muted-foreground">
            {t("auth.playerInvite.claimSignInPrompt")}{" "}
            <Text className="text-sm underline">{t("auth.playerInvite.claimSignIn")}</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
