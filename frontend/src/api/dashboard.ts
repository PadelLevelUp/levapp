import type { DashboardDefinition } from "@/types";
import { api } from "@/api/client";
import { USE_MOCK_DATA } from "@/config";
import {
  mockDashboardStats,
  mockClassInstances,
  mockCalendarEvents,
} from "@/data/mockData";
import { mockConversations } from "@/data/mockMessages";
import { format, addDays } from "date-fns";

function buildMockDashboard(): DashboardDefinition {
  const today = new Date();
  const upcoming = mockClassInstances
    .filter((c) => c.status === "scheduled")
    .slice(0, 3);

  const unreadMessages = mockConversations.reduce(
    (sum, c) => sum + c.unreadCount,
    0
  );
  const conversationsToReply = mockConversations.filter(
    (c) => c.unreadCount > 0
  ).length;
  const latest = mockConversations.find((c) => c.unreadCount > 0);

  return {
    id: "mock-dashboard",
    title: "Dashboard",
    blocks: [
      {
        id: "messages-overview",
        type: "messages_overview",
        data: {
          unreadMessages,
          conversationsToReply,
          latest: latest
            ? {
                sender: latest.participantName,
                preview: latest.lastMessage ?? "",
              }
            : undefined,
          href: "/messages",
        },
      },
      {
        id: "kpi-grid",
        type: "kpi_grid",
        data: {
          items: [
            {
              label: "Alumnos",
              value: mockDashboardStats.totalPlayers,
              icon: "users",
              href: "/players",
            },
            {
              label: "Aulas esta semana",
              value: mockDashboardStats.upcomingClasses,
              icon: "calendar",
              href: "/calendar",
            },
            {
              label: "Validaciones",
              value: mockDashboardStats.pendingValidations,
              icon: "clipboard_check",
              href: "/calendar",
            },
            {
              label: "Ingresos",
              value: mockDashboardStats.monthlyRevenue,
              prefix: "€",
              icon: "trending_up",
              href: "/settings",
            },
          ],
        },
      },
      {
        id: "upcoming-classes",
        type: "class_list",
        data: {
          title: "Próximas aulas",
          emptyText: "Sin aulas programadas",
          items: upcoming.map((c) => ({
            id: c.id,
            title: c.name ?? "Aula",
            dateLabel: c.date,
            timeLabel: `${c.startTime} - ${c.endTime}`,
            color: c.color,
            rightLabel: `${c.participants?.length ?? 0}/${c.maxPlayers}`,
            href: "/calendar",
          })),
        },
      },
    ],
  };
}

export async function getDashboard(params?: {
  from?: string;
  to?: string;
}): Promise<DashboardDefinition> {
  if (USE_MOCK_DATA) {
    return buildMockDashboard();
  }

  const res = await api.get("/app/dashboard", {
    params: {
      from: params?.from,
      to: params?.to,
    },
  });
  return res.data;
}
