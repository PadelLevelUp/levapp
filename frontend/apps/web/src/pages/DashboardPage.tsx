import { AppLayout } from "@/components/layout/AppLayout";
import { LoadingDashboard } from "@/components/ui/loading-skeleton";
import { useEffect, useState } from "react";
import type { DashboardDefinition } from "@/types";
import { DashboardRenderer } from "@/components/dashboard/DashboardRenderer";
import { getDashboard } from "@/api/dashboard";
import { useLayout } from "@/components/layout/LayoutContext";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<DashboardDefinition | null>(null);
  const { setUnreadCount, setLatestMessage } = useLayout();

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
        <div className="p-6">Failed to load dashboard.</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">{dashboard.title}</h1>
        <DashboardRenderer blocks={dashboard.blocks} />
      </div>
    </AppLayout>
  );
}
