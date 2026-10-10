import { AppLayout } from "@/components/layout/AppLayout";
import { LoadingDashboard } from "@/components/ui/loading-skeleton";
import { useCallback, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { COACH_DASHBOARD_ID } from "@/types";
import { CoachDashboard } from "@/components/dashboard/CoachDashboard";
import { StudentDashboard } from "@/components/dashboard/StudentDashboard";
import { EmailPromptBanner } from "@/components/dashboard/coach/EmailPromptBanner";
import { subscribeAppEvents } from "@/api/events";
import { isRequestEvent, queryKeys, useDashboard } from "@levelup/hooks";
import { useAuth } from "@/auth/AuthContext";
import { useLayout } from "@/components/layout/LayoutContext";
import { useTranslation } from "react-i18next";

export default function DashboardPage() {
  const { setUnreadCount, setLatestMessage } = useLayout();
  const { user, token } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // The 30-day window starts at the local midnight of the calendar day, so the query key is
  // byte-identical across mounts within a day and a return inside the stale window renders from
  // cache (client.query-cache rule 2). A `new Date()` here would mint a new key per mount: the
  // first E2E run measured exactly that as one extra request. The dashboard view does not read
  // `from`/`to` today; the window only names the payload.
  const today = format(new Date(), "yyyy-MM-dd");
  const params = useMemo(() => {
    const dayStart = new Date(`${today}T00:00:00`);
    return {
      from: dayStart.toISOString(),
      to: new Date(dayStart.getTime() + 30 * 86400000).toISOString(),
    };
  }, [today]);
  const { data: dashboard, isPending, refetch } = useDashboard(params);

  // Neither home renders the messages block; the layout's unread badge reads it — which is how
  // answering a reminder here also lowers the badge.
  useEffect(() => {
    const messagesBlock = dashboard?.blocks.find((b) => b.type === "messages_overview");
    if (messagesBlock?.type === "messages_overview") {
      setUnreadCount(messagesBlock.data.unreadMessages);
      setLatestMessage(messagesBlock.data.latest ?? null);
    }
  }, [dashboard, setUnreadCount, setLatestMessage]);

  // A silent refetch: the payload swaps in place, no skeleton (isPending is only the first load).
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // classes.class-requests rule 19 (PAD-488): a request change can put a class on the home
  // screen ("next class", the 7-day schedule), so it invalidates the dashboard key.
  useEffect(() => {
    if (!token) return;
    return subscribeAppEvents(token, (data) => {
      if (isRequestEvent(data.type)) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() });
      }
    });
  }, [token, queryClient]);

  if (isPending) {
    return (
      <AppLayout>
        <LoadingDashboard />
      </AppLayout>
    );
  }

  if (!dashboard) {
    return (
      <AppLayout>
        <div className="p-6">{t("dashboard.failedToLoad")}</div>
      </AppLayout>
    );
  }

  // The payload id is the switch (dashboard.blocks rule 3b): both homes share
  // block types now, so sniffing them would tell the two apart by accident.
  const firstName = (user?.name ?? "").trim().split(" ")[0] ?? "";
  const Home = dashboard.id === COACH_DASHBOARD_ID ? CoachDashboard : StudentDashboard;

  return (
    <AppLayout>
      {/* No in-page "Dashboard" heading — the word belongs to the navigation
          alone. The greeting is the page's orientation instead. */}
      {dashboard.id === COACH_DASHBOARD_ID ? <EmailPromptBanner user={user} /> : null}
      <Home blocks={dashboard.blocks} firstName={firstName} onRefresh={refresh} />
    </AppLayout>
  );
}
