import { describe, expect, it } from "vitest";
import { nativeRouteForWebPath } from "./routes";

describe("nativeRouteForWebPath (dashboard.blocks rule 10, shared with push routing since PAD-327 — where a needs-you item lands on iOS)", () => {
  it("opens a class deep link on the class screen, and with Notificar open when asked (PAD-285)", () => {
    const plain = nativeRouteForWebPath("/calendar?classId=lessoninstance-42&date=2026-09-20", { title: "B1", timeLabel: "18:00" });
    expect(plain).toMatchObject({ pathname: "/class/[id]", params: { id: "lessoninstance-42", originalId: "42", date: "2026-09-20", title: "B1", startTime: "18:00" } });
    expect(plain && "params" in plain ? plain.params : {}).not.toHaveProperty("notify");
    const notify = nativeRouteForWebPath("/calendar?classId=lessoninstance-42&date=2026-09-20&notify=1");
    expect(notify).toMatchObject({ pathname: "/class/[id]", params: { id: "lessoninstance-42", notify: "1" } });
  });

  it("falls back to the calendar tab when the class id is not a dashboard id", () => {
    expect(nativeRouteForWebPath("/calendar?classId=garbage")).toEqual({ pathname: "/(tabs)/calendar" });
    expect(nativeRouteForWebPath("/calendar")).toEqual({ pathname: "/(tabs)/calendar" });
  });

  it("opens THAT conversation for a reply, not the messages tab (PAD-284)", () => {
    expect(nativeRouteForWebPath("/messages/17")).toEqual({ pathname: "/conversation/[id]", params: { id: "17" } });
    // The pre-PAD-284 shape still lands on the conversation.
    expect(nativeRouteForWebPath("/messages?conversationId=17")).toEqual({ pathname: "/conversation/[id]", params: { id: "17" } });
    expect(nativeRouteForWebPath("/messages")).toEqual({ pathname: "/(tabs)/messages" });
  });

  it("opens the Presences tab on the week, with the validate view when asked (PAD-283)", () => {
    expect(nativeRouteForWebPath("/presences")).toEqual({ pathname: "/(tabs)/presences", params: { week: "0" } });
    expect(nativeRouteForWebPath("/presences?week=-1")).toEqual({ pathname: "/(tabs)/presences", params: { week: "-1" } });
    expect(nativeRouteForWebPath("/presences?validate=1&week=-1")).toEqual({ pathname: "/(tabs)/presences", params: { week: "-1", validate: "1" } });
  });

  it("keeps the student KPI destinations", () => {
    expect(nativeRouteForWebPath("/players")).toEqual({ pathname: "/(tabs)/players" });
    expect(nativeRouteForWebPath("/attendance")).toEqual({ pathname: "/attendance" });
    expect(nativeRouteForWebPath("/absences")).toEqual({ pathname: "/absences" });
    expect(nativeRouteForWebPath("/nowhere")).toBeNull();
  });

  it("opens the evaluations page from the student dashboard block (PAD-402, evaluations.student-view rule 4)", () => {
    expect(nativeRouteForWebPath("/evaluations")).toEqual({ pathname: "/evaluations" });
  });
});

describe("PAD-327: the request alerts' destinations", () => {
  it("keeps the section, which is the whole point of the alert", () => {
    // "opens Settings → Club and approves" is the business journey; landing on
    // Settings with no section would make the tap almost useless.
    expect(nativeRouteForWebPath("/settings?section=club")).toEqual({
      pathname: "/settings",
      params: { section: "club" },
    });
    expect(nativeRouteForWebPath("/settings?section=admin")).toEqual({
      pathname: "/settings",
      params: { section: "admin" },
    });
    expect(nativeRouteForWebPath("/settings")).toEqual({ pathname: "/settings" });
  });

  it("maps the dashboard", () => {
    expect(nativeRouteForWebPath("/dashboard")).toEqual({ pathname: "/(tabs)/dashboard" });
  });

  it("still returns null for a path it does not know, so a tap goes nowhere", () => {
    expect(nativeRouteForWebPath("/nowhere")).toBeNull();
  });
});
