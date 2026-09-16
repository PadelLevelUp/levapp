/**
 * The app's single answer to "the server gave me a web path"
 * (`dashboard.blocks` rule 10; extended by PAD-327).
 *
 * The server speaks web paths — a needs-you item's `href`, and since PAD-327 a
 * push's `data.path` — and this maps each one to an Expo Router destination.
 * Pure, so it is unit-tested without a simulator.
 *
 * Renamed from `dashboardRoute` when push tap-routing became its second caller:
 * a name saying "dashboard" while serving pushes is the kind of small lie that
 * costs somebody an afternoon later.
 *
 * Returns null for a path it does not know, and BOTH callers treat null as "go
 * nowhere" — never a crash, never a guess (the same rule as B-074's unknown
 * branch).
 */
import { parseDashboardItemId } from "@/features/calendar/params";

export type DashboardRoute =
  | { pathname: "/class/[id]"; params: Record<string, string> }
  | { pathname: "/settings"; params?: { section: string } }
  | { pathname: "/(tabs)/dashboard" }
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

export function nativeRouteForWebPath(
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
  // PAD-327: the request alerts' destinations. `/settings?section=…` keeps its
  // section — that is the whole point of the alert ("opens Settings → Club and
  // approves"), and the native settings screen already reads a `section` param.
  if (href.startsWith("/settings")) {
    const section = query(href).get("section");
    return section
      ? { pathname: "/settings", params: { section } }
      : { pathname: "/settings" };
  }
  if (href.startsWith("/dashboard")) return { pathname: "/(tabs)/dashboard" };
  return null;
}
