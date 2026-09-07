import { registerApi } from "@levelup/api";
import { router } from "expo-router";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "@/components/ui/toast";
import {
  AccountSetupForm,
  AccountSetupLoading,
  AccountSetupNotice,
  type AccountFormField,
} from "@/features/auth/AccountSetupScreen";
import { LegalLinks } from "@/features/auth/LegalLinks";
import {
  registerSchema,
  validateAccountForm,
} from "@/features/auth/account-setup";

type Status = "loading" | "ok" | "already-registered" | "invalid";

/**
 * `/register/:userId` on iOS — the native twin of web's `RegisterPage`
 * (PAD-164). This is the older of the two player paths: the coach created the
 * account outright and shared its activation link (`registerLink()` in
 * `src/lib/web-links.ts` builds exactly this URL from the player screen), and
 * the person fills in their own details to switch it from `inactive` to
 * `active`.
 *
 * Two differences from the invite screens, both inherited from the API:
 *
 * - The lookup can succeed and still be a dead end (`isActive` — someone
 *   already activated this account), which is a different message from a link
 *   that never resolved, so it gets its own non-destructive state.
 * - Activation returns no access token, so the flow cannot end signed in. It
 *   ends on the sign-in screen with a success toast, as web ends on `/auth`.
 *
 * Web reports a failed lookup with a destructive toast and an immediate
 * redirect to `/auth`. On a phone that flashes past — the app was just launched
 * by the link, so the user is looking at a fresh screen, not at a page they
 * navigated from. This renders the invalid state instead and lets them tap
 * through, which is also what both invite screens do.
 */
export function RegisterScreen({ userId }: { userId: string | null }) {
  const { t } = useTranslation();

  const [status, setStatus] = React.useState<Status>(
    userId ? "loading" : "invalid"
  );
  const [values, setValues] = React.useState({
    name: "",
    username: "",
    email: "",
    phone: "",
    password: "",
    repeatPassword: "",
  });
  const [errors, setErrors] = React.useState<Record<string, string | undefined>>(
    {}
  );
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!userId) {
      setStatus("invalid");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await registerApi.registerUser(userId);
        if (cancelled) return;
        if (data?.isActive) {
          setStatus("already-registered");
          return;
        }
        // `username` is deliberately null for a coach-created placeholder
        // (auth.activate rule 5) — `?? ""` keeps that box empty rather than
        // prefilling a generated `pending-…` login.
        setValues((prev) => ({
          ...prev,
          name: data?.name ?? "",
          username: data?.username ?? "",
          email: data?.email ?? "",
          phone: data?.phone ?? "",
        }));
        setStatus("ok");
      } catch {
        if (!cancelled) setStatus("invalid");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const goToLogin = React.useCallback(() => {
    router.replace("/login");
  }, []);

  const onChangeField = React.useCallback((id: string, value: string) => {
    setValues((prev) => ({ ...prev, [id]: value }));
    setErrors((prev) => ({ ...prev, [id]: undefined }));
  }, []);

  const handleSubmit = React.useCallback(async () => {
    if (!userId) return;

    const codes = validateAccountForm(registerSchema, values);
    if (Object.keys(codes).length > 0) {
      const translated: Record<string, string> = {};
      for (const [field, code] of Object.entries(codes)) {
        translated[field] = t(`auth.register.${code}`);
      }
      setErrors(translated);
      return;
    }
    setErrors({});

    setSubmitting(true);
    try {
      await registerApi.activateAccount({
        userId,
        content: {
          name: values.name,
          username: values.username,
          email: values.email,
          phone: values.phone,
          password: values.password,
        },
      });
      toast.success(
        t("auth.register.activatedTitle"),
        t("auth.register.activatedDescription")
      );
      router.replace("/login");
    } catch {
      toast.error(
        t("auth.register.failedTitle"),
        t("auth.register.failedDescription")
      );
    } finally {
      setSubmitting(false);
    }
  }, [t, userId, values]);

  if (status === "loading") {
    return <AccountSetupLoading testID="register-loading" />;
  }

  if (status === "already-registered") {
    return (
      <AccountSetupNotice
        testID="register-already"
        tone="neutral"
        title={t("auth.register.alreadyRegisteredTitle")}
        description={t("auth.register.alreadyRegisteredDescription")}
        actionLabel={t("auth.register.goToLogin")}
        onAction={goToLogin}
      />
    );
  }

  if (status === "invalid") {
    return (
      <AccountSetupNotice
        testID="register-invalid"
        title={t("auth.register.invalidLinkTitle")}
        description={t("auth.register.invalidLinkDescription")}
        actionLabel={t("auth.register.goToLogin")}
        onAction={goToLogin}
      />
    );
  }

  const fields: AccountFormField[] = [
    { id: "name", label: t("auth.register.name"), autoComplete: "name" },
    {
      id: "username",
      label: t("auth.register.username"),
      autoComplete: "username-new",
    },
    {
      id: "email",
      label: t("auth.register.email"),
      keyboardType: "email-address",
      autoComplete: "email",
    },
    {
      id: "phone",
      label: t("auth.register.phone"),
      keyboardType: "phone-pad",
      autoComplete: "tel",
    },
    {
      id: "password",
      label: t("auth.register.password"),
      secure: true,
      autoComplete: "new-password",
    },
    {
      id: "repeatPassword",
      label: t("auth.register.repeatPassword"),
      secure: true,
      autoComplete: "new-password",
    },
  ];

  return (
    <AccountSetupForm
      testID="register"
      title={t("auth.register.title")}
      description={t("auth.register.description")}
      fields={fields}
      values={values}
      errors={errors}
      onChangeField={onChangeField}
      onSubmit={() => void handleSubmit()}
      submitLabel={
        submitting ? t("auth.register.activating") : t("auth.register.activate")
      }
      submitting={submitting}
      submitError={null}
      // Web's RegisterPage carries the same pair under its card.
      footer={<LegalLinks testID="register-legal" />}
    />
  );
}
