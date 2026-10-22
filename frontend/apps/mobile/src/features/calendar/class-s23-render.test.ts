import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** PAD-672 slices 2 and 3, the phone's half: the accepted-at-once state on the class screen and the
 * academy step, the settings toggle, and "Ambos → esquerda/direita" on the participant rows, sheet
 * and the student's own row. Source-reading, as class-side-sheet-render.test.ts: app/class/[id].tsx
 * mounts react-query hooks and a native Modal, and a test file under app/ would break Metro. */
const root = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const json = (p: string) => JSON.parse(readFileSync(resolve(root, "../../src/locales", p), "utf8"));
const SCREEN = read("app/class/[id].tsx");
const ACADEMY = read("src/features/class-requests/wizard/AcademyClassStep.tsx");
const SETTINGS = read("src/features/settings/auto-invite-section.tsx");
const GROUPS = read("src/features/calendar/ParticipantGroups.tsx");
const SHEET = read("src/features/calendar/ParticipantSheet.tsx");

describe("accepted at once (slice 2)", () => {
  it("the class screen says the student is in, and re-reads the class", () => {
    expect(SCREEN).toContain("joinRequestAcceptedAtOnce(request)");
    expect(SCREEN).toContain('t("calendar.joinRequest.acceptedNow")');
    expect(SCREEN).toContain("onRequestSent={(request) => void handleSideRequestSent(request)}");
    expect(SCREEN).toMatch(/handleSideRequestSent = async[\s\S]*?await refreshInstance\(\)/);
  });

  it("the academy step shows the accepted copy and refreshes", () => {
    expect(ACADEMY).toContain("joinRequestAcceptedAtOnce(request)");
    expect(ACADEMY).toContain('"classRequests.academy.acceptedNow"');
  });

  it("the copy exists in pt and en", () => {
    expect(json("pt/calendar.json").calendar.joinRequest.acceptedNow).toBe("Está marcado! Estás inscrito/a nesta aula.");
    expect(json("en/calendar.json").calendar.joinRequest.acceptedNow).toBe("You're in! You're enrolled in this class.");
    expect(json("pt/classRequests.json").classRequests.academy.acceptedNow).toBe("Está marcado! Estás inscrito/a nesta aula.");
    expect(json("en/classRequests.json").classRequests.academy.acceptedNow).toBe("You're in! You're enrolled in this class.");
  });
});

describe("the settings toggle (slice 2)", () => {
  it("is held with the section's Save, disabled in semi-automatic mode with its reason, and toasts the notice", () => {
    expect(SETTINGS).toContain('"autoAcceptJoinRequests",');
    expect(SETTINGS).toContain('testID="settings-auto-accept-join-requests"');
    expect(SETTINGS).toContain('testID="settings-auto-accept-disabled-reason"');
    expect(SETTINGS).toContain('mode === "semi_automatic"');
    expect(SETTINGS).toContain("disabled={autoAcceptBlocked}");
    expect(SETTINGS).toContain('saved.notice === "auto_accept_off"');
    expect(SETTINGS).toContain('t("settings.engine.autoAcceptJoinRequests.turnedOff")');
  });

  it("its copy exists in pt and en", () => {
    const pt = json("pt/settings.json").settings.engine.autoAcceptJoinRequests;
    const en = json("en/settings.json").settings.engine.autoAcceptJoinRequests;
    expect(pt.label).toBe("Aceitar automaticamente pedidos de inscrição de alunos elegíveis em aulas com vaga");
    expect(pt.disabledReason).toBe("Não disponível no modo semi-automático");
    expect(en.label).toBe("Automatically accept eligible students' requests to join classes with a spot");
    expect(en.disabledReason).toBe("Not available in semi-automatic mode");
    for (const k of ["help", "turnedOff"]) {
      expect(typeof pt[k]).toBe("string");
      expect(typeof en[k]).toBe("string");
    }
  });
});

describe("Ambos → esquerda/direita (slice 3)", () => {
  it("the participant chip, the sheet and the student's own row use the assigned-side label", () => {
    expect(GROUPS).toContain("sideLongKeyOf(row.side, row.assignedSide)");
    expect(GROUPS).toContain("sideShortKeyOf(row.side, row.assignedSide)");
    expect(SHEET).toContain("sideLongKeyOf((side?.current ?? row.side)!, row.assignedSide)");
    expect(SCREEN).toContain('testID="class-own-assigned-side"');
    expect(SCREEN).toContain('assignedSideOf("both", myPresence.assignedSide)');
  });

  it("the labels read Ambos → esquerda / direita in pt and Both → left / right in en", () => {
    const pt = json("pt/calendar.json").calendar;
    const en = json("en/calendar.json").calendar;
    expect(pt.participants.sideLong.both_left).toBe("Ambos → esquerda");
    expect(pt.participants.sideLong.both_right).toBe("Ambos → direita");
    expect(en.participants.sideLong.both_left).toBe("Both → left");
    expect(en.participants.sideLong.both_right).toBe("Both → right");
    expect(typeof pt.participants.sideShort.both_left).toBe("string");
    expect(typeof pt.side.yours).toBe("string");
    expect(typeof en.side.yours).toBe("string");
  });
});
