import { AppLayout } from "@/components/layout/AppLayout";
import { LoadingDashboard } from "@/components/ui/loading-skeleton";
import { useEffect, useState } from "react";
import type { DashboardDefinition } from "@/types";
import { DashboardRenderer } from "@/components/dashboard/DashboardRenderer";
import { CoachDashboard } from "@/components/dashboard/CoachDashboard";
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

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);

        const from = new Date().toISOString();
        const to = new Date(Date.now() + 30 * 86400000).toISOString();

        const data = await getDashboard({ from, to });
        setDashboard(data);
        const messagesBlock = data.blocks.find((b) => b.type === "messages_overview");
        if (messagesBlock?.type === "messages_overview") {
          setUnreadCount(messagesBlock.data.unreadMessages);
          setLatestMessage(messagesBlock.data.latest ?? null);
        }
        if (messagesBlock?.type === "messages_overview") {
          setUnreadCount(messagesBlock.data.unreadMessages);
        }
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

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

  // The coach payload carries the rebuilt blocks; the player dashboard still
  // ships the older ones and keeps the generic renderer.
  const isCoachDashboard = dashboard.blocks.some(
    (b) => b.type === "needs_you" || b.type === "next_class" || b.type === "week_pulse",
  );

  if (isCoachDashboard) {
    return (
      <AppLayout>
        {/* No in-page "Dashboard" heading — the word belongs to the navigation
            alone. The greeting is the page's orientation instead. */}
        <CoachDashboard
          blocks={dashboard.blocks}
          firstName={(user?.name ?? "").trim().split(" ")[0] ?? ""}
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">{t("dashboard.title")}</h1>
        <DashboardRenderer blocks={dashboard.blocks} />
      </div>
    </AppLayout>
  );
}
