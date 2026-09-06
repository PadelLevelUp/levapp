import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/auth/AuthContext";
import { Building2 } from "lucide-react";

/**
 * clubs.join-request rule 7 — an approved coach with no club picks one here.
 *
 * Slice A placeholder: explains the next step only. Slice B (PAD-211)
 * replaces this with the real "Create a club / Join an existing club" screen.
 */
const ClubOnboardingPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <img src="/brand/levapp-lockup-on-light.svg" alt="LevApp" className="mb-8 h-12 w-auto dark:hidden" />
      <img src="/brand/levapp-lockup-on-dark.svg" alt="LevApp" className="mb-8 hidden h-12 w-auto dark:block" />

      <Card className="w-full max-w-md" data-testid="club-onboarding">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Building2 className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-bold">{t("auth.clubOnboarding.title")}</CardTitle>
          <CardDescription>{t("auth.clubOnboarding.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("auth.clubOnboarding.comingSoon")}</p>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              logout();
              navigate("/auth", { replace: true });
            }}
          >
            {t("auth.coachPending.signOut")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ClubOnboardingPage;
