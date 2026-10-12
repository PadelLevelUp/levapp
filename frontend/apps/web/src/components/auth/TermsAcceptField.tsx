import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";

/**
 * auth.register rules 19 and 19b (PAD-485, PAD-637): "I have read and accept the Privacy Policy and the
 * Terms of Service", each document a link. Sign-up, the two invite forms, activation and the next-login
 * catch-up use this one field. `id` is also its test id; the error line is `${id}-error`.
 */
export function TermsAcceptField({
  id,
  checked,
  onCheckedChange,
  error,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  error?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <div className="flex items-start gap-2">
        <Checkbox
          id={id}
          data-testid={id}
          checked={checked}
          aria-invalid={error ? true : undefined}
          onCheckedChange={(next) => onCheckedChange(next === true)}
        />
        <label htmlFor={id} className="text-sm leading-snug">
          {t("auth.signup.termsAcceptPrefix")}{" "}
          <Link to="/privacy" target="_blank" className="underline hover:text-foreground">
            {t("auth.legal.privacyPolicy")}
          </Link>{" "}
          {t("auth.signup.termsAcceptJoin")}{" "}
          <Link to="/terms" target="_blank" className="underline hover:text-foreground">
            {t("auth.legal.terms")}
          </Link>
        </label>
      </div>
      {error && (
        <p className="text-sm text-destructive" data-testid={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
