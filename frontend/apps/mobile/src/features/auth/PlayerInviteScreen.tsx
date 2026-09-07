import { playerInvitationsApi } from "@levelup/api";
import { router } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/auth/AuthContext";
import { toast } from "@/components/ui/toast";
import {
  AccountSetupForm,
  AccountSetupLoading,
  AccountSetupNotice,
  type AccountFormField,
} from "@/features/auth/AccountSetupScreen";
import {
  playerInviteSchema,
  submitOutcomeForError,
  validateAccountForm,
} from "@/features/auth/account-setup";

type Status = "loading" | "valid" | "invalid";

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
  const { login } = useAuth();

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

  if (status === "loading") {
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
  );
}
