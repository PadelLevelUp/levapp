import { formatBirthInput } from "@/features/auth/signup-form";
import { invitationsApi } from "@levelup/api";
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
  coachInviteAcceptPayload,
  coachInviteEmailError,
  coachInviteLanding,
  coachInviteSchema,
  submitOutcomeForError,
  ACTIVATION_BIRTH_CODES,
  ACTIVATION_COUNTRY_CODES,
  validateAccountForm,
} from "@/features/auth/account-setup";

type Status = "loading" | "valid" | "invalid";

/**
 * `/invite/coach/:token` on iOS — the native twin of web's `CoachInvitePage`
 * (PAD-164). A coach already in a club shares a link; whoever opens it creates
 * a coach account and joins that club.
 *
 * Same shape as the player invite, one extra field (`name`) and its own
 * namespace. The screen only covers the "accept as a NEW coach" path, which is
 * all web's page covers too — an existing coach joining a second club goes
 * through the authenticated route, not this form.
 */
export function CoachInviteScreen({ token }: { token: string | null }) {
  const { t } = useTranslation();
  const { login, refreshUser } = useAuth();

  const [status, setStatus] = React.useState<Status>(
    token ? "loading" : "invalid"
  );
  const [clubName, setClubName] = React.useState("");
  const [values, setValues] = React.useState({
    name: "",
    username: "",
    email: "",
    password: "",
    repeatPassword: "",
    // PAD-457: DD/MM/AAAA, typed with the number pad as on sign-up.
    birthDate: "",
    country: "PT",
    terms: "",
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
        const data = await invitationsApi.getCoachInvitation(token);
        if (cancelled) return;
        setClubName(data.clubName);
        setStatus("valid");
      } catch {
        // 404 (unknown) or 410 (used / revoked / expired).
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
    const next = id === "birthDate" ? formatBirthInput(value) : value;
    setValues((prev) => ({ ...prev, [id]: next }));
    setErrors((prev) => ({ ...prev, [id]: undefined }));
  }, []);

  const handleSubmit = React.useCallback(async () => {
    if (!token) return;
    setSubmitError(null);

    const codes = validateAccountForm(coachInviteSchema, values);
    // PAD-637 (auth.register rule 19b): the Terms box is checked with the rest of the form.
    const termsMissing = values.terms !== "true";
    if (Object.keys(codes).length > 0 || termsMissing) {
      const translated: Record<string, string> = {};
      for (const [field, code] of Object.entries(codes)) {
        translated[field] = t(`auth.coachInvite.${code}`);
      }
      if (termsMissing) translated.terms = t("auth.legal.termsRequiredToContinue");
      setErrors(translated);
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      const { accessToken } = await invitationsApi.acceptCoachInvitation(
        token,
        coachInviteAcceptPayload(values)
      );
      toast.success(
        t("auth.coachInvite.welcomeTitle"),
        t("auth.coachInvite.welcomeDescription", { clubName })
      );
      await login(accessToken);
      // Rule 9: a pending account confirms its email before the dashboard.
      router.replace(coachInviteLanding(await refreshUser()) as never);
    } catch (error) {
      // PAD-457: a birth-date refusal belongs on the field, in the form's words.
      const res = (error as { response?: { status?: number; data?: { field?: string; code?: string } } }).response;
      const birthKey = res?.data?.code ? ACTIVATION_BIRTH_CODES[res.data.code] : undefined;
      if (res?.status === 400 && res.data?.field === "birthDate" && birthKey) {
        setErrors({ birthDate: t(`auth.coachInvite.${birthKey}`) });
        return;
      }
      // PAD-637: a Terms refusal belongs on the box.
      if (res?.status === 400 && res?.data?.field === "terms") {
        setErrors({ terms: t("auth.legal.termsRequiredToContinue") });
        return;
      }
      // PAD-604: a country refusal belongs on the field, in the form's words.
      if (res?.status === 400 && res?.data?.field === "country" && ACTIVATION_COUNTRY_CODES[res?.data?.code ?? ""]) {
        setErrors({ country: t("auth.coachInvite.countryRequired") });
        return;
      }
      const emailKey = coachInviteEmailError(error);
      if (emailKey) {
        setErrors({ email: t(`auth.coachInvite.${emailKey}`) });
        return;
      }
      const outcome = submitOutcomeForError(error);
      if (outcome === "username-taken") {
        setSubmitError(t("auth.coachInvite.usernameTaken"));
      } else if (outcome === "invalid-token") {
        setStatus("invalid");
      } else {
        setSubmitError(t("auth.coachInvite.genericError"));
      }
    } finally {
      setSubmitting(false);
    }
  }, [clubName, login, refreshUser, t, token, values]);

  if (status === "loading") {
    return <AccountSetupLoading testID="coach-invite-loading" />;
  }

  if (status === "invalid") {
    return (
      <AccountSetupNotice
        testID="coach-invite-invalid"
        title={t("auth.coachInvite.invalidTitle")}
        description={t("auth.coachInvite.invalidDescription")}
        actionLabel={t("auth.coachInvite.goToLogin")}
        onAction={goToLogin}
      />
    );
  }

  const fields: AccountFormField[] = [
    { id: "name", label: t("auth.coachInvite.name"), autoComplete: "name" },
    {
      id: "username",
      label: t("auth.coachInvite.username"),
      autoComplete: "username-new",
    },
    {
      id: "email",
      label: t("auth.coachInvite.email"),
      keyboardType: "email-address",
      autoComplete: "email",
    },
    {
      id: "password",
      label: t("auth.coachInvite.password"),
      secure: true,
      autoComplete: "new-password",
    },
    {
      id: "repeatPassword",
      label: t("auth.coachInvite.repeatPassword"),
      secure: true,
      autoComplete: "new-password",
    },

    {
      id: "birthDate",
      label: t("auth.coachInvite.birthDate"),
      keyboardType: "number-pad",
      placeholder: "DD/MM/AAAA",
    },
    // PAD-604: right after the birth date; required, default PT.
    { id: "country", label: t("auth.coachInvite.country"), kind: "country" },
    // PAD-637: the Terms box, last, as on sign-up.
    { id: "terms", label: "", kind: "terms" },
  ];

  return (
    <AccountSetupForm
      testID="coach-invite"
      title={t("auth.coachInvite.title", { clubName })}
      description={t("auth.coachInvite.description")}
      fields={fields}
      values={values}
      errors={errors}
      onChangeField={onChangeField}
      onSubmit={() => void handleSubmit()}
      submitLabel={
        submitting ? t("auth.coachInvite.joining") : t("auth.coachInvite.join")
      }
      submitting={submitting}
      submitError={submitError}
    />
  );
}
