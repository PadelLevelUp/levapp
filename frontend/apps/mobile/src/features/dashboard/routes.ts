/**
 * dashboard.blocks rule 10 (PAD-283 / PAD-284 / PAD-285): where a needs-you
 * item's `href` lands on iOS. The server speaks web paths; this maps each one
 * to an Expo Router destination. Pure, so the mapping is unit-tested without a
 * simulator — `blocks.tsx`'s `go()` just pushes what this returns.
 */
import { parseDashboardItemId } from "@/features/calendar/params";

export type DashboardRoute =
  | { pathname: "/class/[id]"; params: Record<string, string> }
  | { pathname: "/(tabs)/calendar" }
  | { pathname: "/(tabs)/messages" }
  | { pathname: "/conversation/[id]"; params: { id: string } }
  | { pathname: "/(tabs)/players" }
  | { pathname: "/(tabs)/presences"; params: { week: string; validate?: string } }
  | { pathname: "/attendance" }
  | { pathname: "/absences" };

function query(href: string): URLSearchParams {
  return new URLSearchParams(href.split("?")[1] ?? "");
}

export function dashboardRoute(
  href: string,
  hint?: { title?: string; timeLabel?: string }
): DashboardRoute | null {
  if (href.startsWith("/calendar")) {
    const params = query(href);
    const classId = params.get("classId") ?? "";
    const parsed = classId ? parseDashboardItemId(classId) : null;
    if (!parsed) return { pathname: "/(tabs)/calendar" };
    const out: Record<string, string> = {
      id: classId,
      model: parsed.model,
      originalId: String(parsed.originalId),
      date: params.get("date") ?? parsed.date,
      startTime: hint?.timeLabel ?? "",
      title: hint?.title ?? "",
      isRecurring: parsed.date ? "1" : "0",
    };
    // PAD-285: "Convidar" opens the class with Notificar already open.
    if (params.get("notify") === "1") out.notify = "1";
    return { pathname: "/class/[id]", params: out };
  }
  if (href.startsWith("/messages")) {
    // PAD-284: a reply lands on THAT conversation. `/messages/<id>` is the web
    // route the server emits; `?conversationId=` is the pre-PAD-284 shape.
    const path = href.split("?")[0];
    const id = path.split("/")[2] || query(href).get("conversationId") || "";
    if (id) return { pathname: "/conversation/[id]", params: { id } };
    return { pathname: "/(tabs)/messages" };
  }
  if (href.startsWith("/players")) return { pathname: "/(tabs)/players" };
  if (href.startsWith("/presences")) {
    // PAD-201: on the week the card counted; PAD-283: with the validate view open.
    const params = query(href);
    const route: DashboardRoute = { pathname: "/(tabs)/presences", params: { week: params.get("week") ?? "0" } };
    if (params.get("validate") === "1") route.params.validate = "1";
    return route;
  }
  // PAD-162 / PAD-163: the student's Attended / Missed KPIs.
  if (href.startsWith("/attendance")) return { pathname: "/attendance" };
  if (href.startsWith("/absences")) return { pathname: "/absences" };
  return null;
}
