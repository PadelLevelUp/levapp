import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinTokenFromInput } from "@/api/joinTokens";

/**
 * players.join-token rule 8 — "Connect with a coach": the student's landing
 * after signup, the dashboard's empty state, and a Settings → Account entry.
 *
 * No in-app scanner (rule 10): the phone camera opens the link. On the web the
 * student pastes the link — a full URL or the bare `/join/coach/<token>` path —
 * and is sent to the join page.
 */
const ConnectWithCoachPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleGo = (e: React.FormEvent) => {
    e.preventDefault();
    const token = joinTokenFromInput(value);
    if (!token) {
      setError(t("players.connect.invalidLink"));
      return;
    }
    navigate(`/join/coach/${token}`);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <img src="/brand/levapp-lockup-on-light.svg" alt="LevApp" className="mb-8 h-12 w-auto dark:hidden" />
      <img src="/brand/levapp-lockup-on-dark.svg" alt="LevApp" className="mb-8 hidden h-12 w-auto dark:block" />

      <Card className="w-full max-w-md" data-testid="connect-with-coach">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <QrCode className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl font-bold">{t("players.connect.title")}</CardTitle>
          <CardDescription>{t("players.connect.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleGo} className="space-y-2">
            <Label htmlFor="connect-paste-input">{t("players.connect.pasteLabel")}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="connect-paste-input"
                data-testid="connect-paste-input"
                placeholder={t("players.connect.pastePlaceholder")}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(null);
                }}
                autoComplete="off"
              />
              <Button type="submit" data-testid="connect-paste-go">
                {t("players.connect.go")}
              </Button>
            </div>
            {error && (
              <p className="text-sm text-destructive" data-testid="connect-paste-error">
                {error}
              </p>
            )}
          </form>
          <p className="text-sm text-muted-foreground">{t("players.connect.stepWait")}</p>
          <Button asChild variant="outline" className="w-full">
            <Link to="/dashboard">{t("players.connect.goToDashboard")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConnectWithCoachPage;
