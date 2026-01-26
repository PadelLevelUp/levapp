import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  Calendar,
  ClipboardCheck,
  TrendingUp,
  UserPlus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { getDashboardStats } from "@/api/dashboard";
import { getCalendarEvents } from "@/api/calendar";
import { getConversations } from "@/api/messages";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import type { 
  DashboardStats, 
  Conversation,
  CalendarEvent,
} from "@/types";
import { LoadingDashboard } from "@/components/ui/loading-skeleton";

const COACH_ID = "1";
const USER_ID = 2;

export default function DashboardPage() {
  const navigate = useNavigate();

  /* ---------------- State ---------------- */

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [classes, setClasses] = useState<CalendarEvent[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  /* ---------------- Data loading ---------------- */

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true);

        const from = new Date().toISOString();
        const to = new Date(Date.now() + 30 * 86400000).toISOString();

        const [
          statsData,
          classesData,
          conversationsData,
        ] = await Promise.all([
          getDashboardStats(),
          getCalendarEvents(from, to, USER_ID),
          getConversations(USER_ID),
        ]);

        setStats(statsData);
        setClasses(classesData);
        setConversations(conversationsData);
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  /* ---------------- Derived data ---------------- */

  const scheduled = classes.filter((c) => c.status === "scheduled");

  const upcomingClasses = scheduled.slice(0, 5);

  const needsPlayers = scheduled
    .filter((c) => (c.participantCount) < c.maxPlayers)
    .sort((a, b) => {
      const aMissing = a.maxPlayers - (a.participantCount);
      const bMissing = b.maxPlayers - (b.participantCount);
      if (bMissing !== aMissing) return bMissing - aMissing;

      const aTime = new Date(`${a.date}T${a.startTime}`).getTime();
      const bTime = new Date(`${b.date}T${b.startTime}`).getTime();
      return aTime - bTime;
    })
    .slice(0, 5);

  /* ---------------- Messages stats ---------------- */

  const unreadMessages = conversations.reduce(
    (sum, conv) => sum + conv.unreadCount,
    0
  );

  const conversationsNeedingReply = conversations.filter(
    (conv) => conv.unreadCount > 0
  ).length;

  const latestConversation = conversations
    .sort((a, b) => {
      const timeA = a.lastMessageTime.split(':').reduce((acc, t) => acc * 60 + Number(t), 0);
      const timeB = b.lastMessageTime.split(':').reduce((acc, t) => acc * 60 + Number(t), 0);
      
      return timeB - timeA;
    })[0];

  const lastMessageSender  = latestConversation?.participantName ?? "";
  const lastMessagePreview = latestConversation?.lastMessage ?? "";

const goToMessages = () => navigate("/messages");

  /* ---------------- Loading guard ---------------- */

  if (loading) {
    return (
      <AppLayout>
        <LoadingDashboard />
      </AppLayout>
    );
  }

  /* ---------------- Render ---------------- */

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>

        {/* ---------------- Messages overview ---------------- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card
            role="button"
            tabIndex={0}
            onClick={goToMessages}
            onKeyDown={(e) => e.key === "Enter" && goToMessages()}
            className="cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Unread messages
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{unreadMessages}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Messages waiting for reply
              </p>
            </CardContent>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            onClick={goToMessages}
            onKeyDown={(e) => e.key === "Enter" && goToMessages()}
            className="hidden md:block cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Latest message
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium truncate">
                {lastMessageSender}
              </p>
              <p className="text-sm text-muted-foreground truncate mt-1">
                {lastMessagePreview}
              </p>
            </CardContent>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            onClick={goToMessages}
            onKeyDown={(e) => e.key === "Enter" && goToMessages()}
            className="hidden md:block cursor-pointer hover:bg-muted/50 transition-colors"
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Conversations to reply
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {conversationsNeedingReply}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                With unread messages
              </p>
            </CardContent>
          </Card>
          
        </div>

        {/* ---------------- KPI stats ---------------- */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card
            role="button"
            tabIndex={0}
            onClick={() => navigate("/players")}
            className="cursor-pointer hover:shadow-md transition-shadow"
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Players
              </CardTitle>
              <Users className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalPlayers}</div>
            </CardContent>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            onClick={() => navigate("/calendar")}
            className="cursor-pointer hover:shadow-md transition-shadow"
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Upcoming classes
              </CardTitle>
              <Calendar className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.upcomingClasses}
              </div>
            </CardContent>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            onClick={() => navigate("/validations")}
            className="cursor-pointer hover:shadow-md transition-shadow"
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending validation
              </CardTitle>
              <ClipboardCheck className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.pendingValidations}
              </div>
            </CardContent>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            onClick={() => navigate("/revenue")}
            className="cursor-pointer hover:shadow-md transition-shadow"
          >
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Revenue (est.)
              </CardTitle>
              <TrendingUp className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                €{stats.monthlyRevenue}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ---------------- Lists ---------------- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Upcoming classes */}
          <Card>
            <CardHeader>
              <CardTitle>Upcoming classes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {upcomingClasses.map((cls) => (
                  <div
                    key={cls.id}
                    onClick={() =>
                      navigate(`/calendar?classId=${cls.id}`)
                    }
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted transition-colors"
                  >
                    <div
                      className="w-1 h-10 rounded-full"
                      style={{ backgroundColor: cls.color }}
                    />
                    <div className="flex-1">
                      <p className="font-medium">{cls.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(cls.date), "EEE d MMM", {
                          locale: enUS,
                        })}{" "}
                        · {cls.startTime}
                      </p>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {cls.participantCount}/{cls.maxPlayers}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Needs players */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Needs players</CardTitle>
              <UserPlus className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {needsPlayers.map((cls) => {
                  const count = cls.participantCount;
                  const missing = cls.maxPlayers - count;

                  return (
                    <div
                      key={cls.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-muted/50"
                    >
                      <div
                        className="w-1 h-10 rounded-full"
                        style={{ backgroundColor: cls.color }}
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{cls.title}</p>
                          <span className="text-xs font-medium px-2 py-1 rounded-full bg-primary/10 text-primary">
                            Missing {missing}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(cls.date), "EEE d MMM", {
                            locale: enUS,
                          })}{" "}
                          · {cls.startTime}
                        </p>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {count}/{cls.maxPlayers}
                      </div>
                    </div>
                  );
                })}

                {needsPlayers.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    All scheduled classes are full 
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
