import { describe, expect, it } from "vitest";
import { dashboardRoute } from "./routes";

describe("dashboardRoute (dashboard.blocks rule 10 — where a needs-you item lands on iOS)", () => {
  it("opens a class deep link on the class screen, and with Notificar open when asked (PAD-285)", () => {
    const plain = dashboardRoute("/calendar?classId=lessoninstance-42&date=2026-09-20", { title: "B1", timeLabel: "18:00" });
    expect(plain).toMatchObject({ pathname: "/class/[id]", params: { id: "lessoninstance-42", originalId: "42", date: "2026-09-20", title: "B1", startTime: "18:00" } });
    expect(plain && "params" in plain ? plain.params : {}).not.toHaveProperty("notify");
    const notify = dashboardRoute("/calendar?classId=lessoninstance-42&date=2026-09-20&notify=1");
    expect(notify).toMatchObject({ pathname: "/class/[id]", params: { id: "lessoninstance-42", notify: "1" } });
  });

  it("falls back to the calendar tab when the class id is not a dashboard id", () => {
    expect(dashboardRoute("/calendar?classId=garbage")).toEqual({ pathname: "/(tabs)/calendar" });
    expect(dashboardRoute("/calendar")).toEqual({ pathname: "/(tabs)/calendar" });
  });

  it("opens THAT conversation for a reply, not the messages tab (PAD-284)", () => {
    expect(dashboardRoute("/messages/17")).toEqual({ pathname: "/conversation/[id]", params: { id: "17" } });
    // The pre-PAD-284 shape still lands on the conversation.
    expect(dashboardRoute("/messages?conversationId=17")).toEqual({ pathname: "/conversation/[id]", params: { id: "17" } });
    expect(dashboardRoute("/messages")).toEqual({ pathname: "/(tabs)/messages" });
  });

  it("opens the Presences tab on the week, with the validate view when asked (PAD-283)", () => {
    expect(dashboardRoute("/presences")).toEqual({ pathname: "/(tabs)/presences", params: { week: "0" } });
    expect(dashboardRoute("/presences?week=-1")).toEqual({ pathname: "/(tabs)/presences", params: { week: "-1" } });
    expect(dashboardRoute("/presences?validate=1&week=-1")).toEqual({ pathname: "/(tabs)/presences", params: { week: "-1", validate: "1" } });
  });

  it("keeps the student KPI destinations", () => {
    expect(dashboardRoute("/players")).toEqual({ pathname: "/(tabs)/players" });
    expect(dashboardRoute("/attendance")).toEqual({ pathname: "/attendance" });
    expect(dashboardRoute("/absences")).toEqual({ pathname: "/absences" });
    expect(dashboardRoute("/nowhere")).toBeNull();
  });
});
