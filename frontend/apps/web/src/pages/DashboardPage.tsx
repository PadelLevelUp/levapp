import { AppLayout } from "@/components/layout/AppLayout";
import { LoadingDashboard } from "@/components/ui/loading-skeleton";
import { useCallback, useEffect, useState } from "react";
import type { DashboardDefinition } from "@/types";
import { COACH_DASHBOARD_ID } from "@/types";
import { CoachDashboard } from "@/components/dashboard/CoachDashboard";
import { StudentDashboard } from "@/components/dashboard/StudentDashboard";
import { getDashboard } from "@/api/dashboard";
import { useAuth } from "@/auth/AuthContext";
import { useLayout } from "@/components/layout/LayoutContext";
import { useTranslation } from "react-i18next";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardDefinition | null>(null);
  const { setUnreadCount, setLatestMessage } = useLayout();
  const { user } = useAuth();
  const { t } = useTranslation();

  // `silent` keeps the page in place: a refetch after the student answers a
  // reminder must swap the payload, not flash the skeleton.
  const load = useCallback(
    async (silent = false) => {
      try {
        if (!silent) setLoading(true);

      const from = new Date().toISOString();
      const to = new Date(Date.now() + 30 * 86400000).toISOString();

        const data = await getDashboard({ from, to });
        setDashboard(data);
        // Neither home renders this block; the layout's unread badge reads it —
        // which is how answering a reminder here also lowers the badge.
        const messagesBlock = data.blocks.find((b) => b.type === "messages_overview");
        if (messagesBlock?.type === "messages_overview") {
          setUnreadCount(messagesBlock.data.unreadMessages);
          setLatestMessage(messagesBlock.data.latest ?? null);
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [setUnreadCount, setLatestMessage],
  );

  useEffect(() => {
    load();
  }, [load]);
  const refresh = useCallback(() => load(true), [load]);

  if (loading) {
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
      <Home blocks={dashboard.blocks} firstName={firstName} onRefresh={refresh} />
    </AppLayout>
  );
}
