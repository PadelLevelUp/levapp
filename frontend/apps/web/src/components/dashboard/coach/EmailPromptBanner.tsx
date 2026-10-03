import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { MailWarning } from "lucide-react";
import { asksForEmail, emailPromptSession } from "@levelup/config";
import type { MeResponse } from "@/api/auth";
import { Button } from "@/components/ui/button";

/**
 * PAD-482 (auth.email-verification rule 14): a coach with no email is asked for one. Never a hold:
 * "Agora não" hides it for this session only (nothing is stored), "Adicionar email" opens Settings →
 * Perfil on the email field, where saving runs the usual code flow. The iOS twin is
 * `features/dashboard/email-prompt-banner.tsx`, with the same test ids.
 */
export function EmailPromptBanner({ user }: { user: MeResponse | null | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => (user ? emailPromptSession.isDismissed(user.id) : false));

  if (!user || !asksForEmail(user) || dismissed) return null;
  return (
    <div
      data-testid="email-prompt"
      role="status"
      className="mx-4 mt-4 flex flex-col gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-center md:mx-6"
    >
      <MailWarning className="h-5 w-5 shrink-0 text-warning" aria-hidden />
      <p className="flex-1 text-sm">{t("dashboard.emailPrompt.text")}</p>
      <div className="flex gap-2">
        <Button size="sm" data-testid="email-prompt-add" onClick={() => navigate("/settings?tab=profile&focus=email")}>
          {t("dashboard.emailPrompt.add")}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          data-testid="email-prompt-dismiss"
          onClick={() => { emailPromptSession.dismiss(user.id); setDismissed(true); }}
        >
          {t("dashboard.emailPrompt.dismiss")}
        </Button>
      </div>
    </div>
  );
}
