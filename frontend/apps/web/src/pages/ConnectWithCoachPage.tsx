import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { QrCode } from "lucide-react";

/**
 * players.join-token rule 8 — "Connect with a coach", the student's first
 * screen after signup.
 *
 * Slice A placeholder: explains the two ways in (a QR or link from the coach,
 * or the coach adding them). Slice C (PAD-212) adds the paste-link field and
 * the join flow itself.
 */
const ConnectWithCoachPage = () => {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <img src="/brand/levapp-lockup-on-light.svg" alt="LevApp" className="mb-8 h-12 w-auto dark:hidden" />
      <img src="/brand/levapp-lockup-on-dark.svg" alt="LevApp" className="mb-8 hidden h-12 w-auto dark:block" />

      <Card className="w-full max-w-md" data-testid="connect-with-coach">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <QrCode className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-bold">{t("auth.connect.title")}</CardTitle>
          <CardDescription>{t("auth.connect.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>{t("auth.connect.stepScan")}</li>
            <li>{t("auth.connect.stepWait")}</li>
          </ol>
          <Button asChild variant="outline" className="w-full">
            <Link to="/dashboard">{t("auth.connect.goToDashboard")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConnectWithCoachPage;
