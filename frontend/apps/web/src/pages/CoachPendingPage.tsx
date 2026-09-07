import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getMe } from "@/api/auth";
import { useAuth } from "@/auth/AuthContext";
import { postLoginPath } from "@/auth/postLoginPath";
import { Clock, ShieldX } from "lucide-react";

/**
 * auth.coach-approval rule 6 — the two holding screens for a self-registered
 * coach: "waiting for LevApp approval" and "not approved". Neither offers any
 * club or roster action; Sign out and (for rejected) the support link are the
 * only exits. The approval state comes from the session; a fresh `/auth/me`
 * on mount lets a coach who was approved while this page was open move on
 * with a reload rather than a sign-out.
 */
const CoachPendingPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [approval, setApproval] = useState(user?.coachApproval ?? "pending");

  useEffect(() => {
    let active = true;
    getMe()
      .then((me) => {
        if (!active) return;
        const target = postLoginPath(me);
        if (target !== "/coach-pending") {
          navigate(target, { replace: true });
          return;
        }
        setApproval(me.coachApproval ?? "pending");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [navigate]);

  const rejected = approval === "rejected";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <img src="/brand/levapp-lockup-on-light.svg" alt="LevApp" className="mb-8 h-12 w-auto dark:hidden" />
      <img src="/brand/levapp-lockup-on-dark.svg" alt="LevApp" className="mb-8 hidden h-12 w-auto dark:block" />

      <Card className="w-full max-w-md" data-testid={rejected ? "coach-rejected" : "coach-pending"}>
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            {rejected ? <ShieldX className="h-6 w-6" /> : <Clock className="h-6 w-6" />}
          </div>
          <CardTitle className="text-2xl font-bold">
            {rejected ? t("auth.coachPending.rejectedTitle") : t("auth.coachPending.title")}
          </CardTitle>
          <CardDescription>
            {rejected
              ? t("auth.coachPending.rejectedDescription")
              : t("auth.coachPending.description", { name: user?.name ?? "" })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!rejected && (
            <p className="text-sm text-muted-foreground">{t("auth.coachPending.whatNext")}</p>
          )}
          {rejected && (
            <Button asChild variant="outline" className="w-full">
              <Link to="/support">{t("auth.coachPending.contactSupport")}</Link>
            </Button>
          )}
          <Button
            variant="ghost"
            className="w-full"
            data-testid="coach-pending-signout"
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

export default CoachPendingPage;
