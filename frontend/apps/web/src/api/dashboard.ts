import "@/api/client";
import type { DashboardDefinition } from "@/types";
import * as dashboardApi from "@levelup/api/src/resources/dashboard";
import { USE_MOCK_DATA } from "@/config";
import {
  mockDashboardStats,
  mockClassInstances,
} from "@/data/mockData";
import { mockConversations } from "@/data/mockData";

function buildMockDashboard(): DashboardDefinition {
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
                // PAD-203: null when the counterpart is gone. The dashboard
                // card has no `t` here, so it falls back to the empty string
                // and the tile simply shows the preview without a name.
                sender: latest.participantName ?? "",
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
            // Deep link into that exact occurrence — see dashboard.navigation rule 8.
            href: `/calendar?classId=${encodeURIComponent(c.id)}&date=${c.date}`,
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

  return dashboardApi.getDashboard(params);
}
