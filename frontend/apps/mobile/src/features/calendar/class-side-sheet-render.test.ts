import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** PAD-672 slice 1 (classes.join-requests rule 20), the phone's half: the side sheet, its wiring on
 * the class screen and the academy step, the coach's chip and "Usar … no perfil", the standing
 * waiting-list side and the `join-side` capability. Source-reading: app/class/[id].tsx mounts
 * react-query hooks and a native Modal, and a test file under app/ would break Metro. */
const root = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");
const SHEET = read("src/features/calendar/ClassSideSheet.tsx");
const SCREEN = read("app/class/[id].tsx");
const ACADEMY = read("src/features/class-requests/wizard/AcademyClassStep.tsx");
const CHIP = read("src/features/calendar/join-request-side.tsx");
const REQUESTS = read("src/features/class-requests/class-requests-section.tsx");
const STANDING = read("src/features/players/waiting-list-dialog.tsx");
const I18N = read("src/lib/i18n.ts");
const PT = JSON.parse(readFileSync(resolve(root, "../../src/locales/pt/calendar.json"), "utf8")).calendar.sidePick;
const EN = JSON.parse(readFileSync(resolve(root, "../../src/locales/en/calendar.json"), "utf8")).calendar.sidePick;

describe("the side sheet", () => {
  it("is a native Modal bottom sheet of three radio cards, in the shared order", () => {
    expect(SHEET).toContain("<Modal");
    expect(SHEET).toContain('accessibilityRole="radiogroup"');
    expect(SHEET).toContain('accessibilityRole="radio"');
    expect(SHEET).toContain("SIDE_CHOICE_ORDER.map");
  });

  it("pre-selects the profile side, tags it Habitual and keeps send disabled until one is chosen", () => {
    expect(SHEET).toContain("preselectedSide(profileSide)");
    expect(SHEET).toContain('t("calendar.sidePick.usual")');
    expect(SHEET).toMatch(/busy \|\| !canSendSide\(chosen\)/);
  });

  it("sends the chosen side; the 409 side_full offers both-sides or that side's waiting list", () => {
    expect(SHEET).toContain("createClassJoinRequest(event, note, side)");
    expect(SHEET).toContain("sideFullOf(err)");
    expect(SHEET).toMatch(/testID="class-side-play-both"|"class-side-play-both"/);
    expect(SHEET).toContain('sendRequest("both")');
    expect(SHEET).toContain("joinClassWaitingList(event, side)");
    expect(SHEET).toContain("joinList(full.requestedSide)");
  });

  it("drives pressed and selected visuals with inline style, never an active: class (native Modal trap)", () => {
    expect(SHEET).not.toMatch(/active:/);
  });
});

describe("the class screen", () => {
  it("opens the sheet from 'Pedir para entrar' and from the waiting-list join, sending nothing itself", () => {
    expect(SCREEN).toContain('onPress={() => setSideSheet("request")}');
    expect(SCREEN).toContain('onPress={() => setSideSheet("waiting")}');
    expect(SCREEN).not.toContain("handleJoinRequest");
    expect(SCREEN).not.toContain("joinClassWaitingList(event)");
    expect(SCREEN).toMatch(/profileSide=\{instance\?\.profileSide \?\? event\.profileSide \?\? null\}/);
  });

  it("shows the sent request with its side and coach, and 'Cancelar pedido'", () => {
    expect(SCREEN).toContain('t("calendar.sidePick.sentLine"');
    expect(SCREEN).toContain("firstAndLastName(event.coachName)");
    expect(SCREEN).toContain('t("calendar.sidePick.cancelRequest")');
    expect(SCREEN).toContain('t("calendar.sidePick.waitingLine"');
  });

  it("shows the coach each request's side chip", () => {
    expect(SCREEN).toContain("<JoinRequestSide request={req} />");
    expect(REQUESTS).toContain('role === "coach" ? <JoinRequestSide request={r} />');
  });
});

describe("the academy step", () => {
  it("asks the side before a request or a waiting-list join, defaulting to the coach's profile side", () => {
    expect(ACADEMY).toContain('setSideFor({ c, mode: "request" })');
    expect(ACADEMY).toContain('setSideFor({ c, mode: "waiting" })');
    expect(ACADEMY).toContain("query.data.profileSide");
    expect(ACADEMY).not.toContain("createClassJoinRequest(c, note)");
  });
});

describe("the coach side", () => {
  it("shows the chip and saves a suggested profile side through edit_player", () => {
    expect(CHIP).toContain("requestedSideChipKey(request.side)");
    expect(CHIP).toContain("suggestedProfileSideOf(request.suggestedProfileSide)");
    expect(CHIP).toContain("setPlayerProfileSide(request.coachId, request.playerId, suggested)");
    expect(CHIP).toContain('t("calendar.sidePick.coach.useInProfile"');
  });

  it("the standing waiting-list add chooses a side, defaulting to the profile side", () => {
    expect(STANDING).toContain("standingDefaultSide(profileSide)");
    expect(STANDING).toContain("mutateAsync({ playerId, credits, expiresOn, side })");
  });
});

describe("strings and capability", () => {
  it("every sheet key exists in pt and en, and the calendar namespace is statically imported", () => {
    for (const bag of [PT, EN]) {
      for (const k of ["title", "sub", "waitingSub", "usual", "moreChances", "cancel", "send", "playBoth", "stayWaiting", "fullTitle", "fullBody"]) {
        expect(typeof bag[k], k).toBe("string");
      }
      for (const side of ["right", "left", "both"]) {
        expect(typeof bag.hint[side]).toBe("string");
        expect(typeof bag.waitingHint[side]).toBe("string");
        expect(typeof bag.word[side]).toBe("string");
      }
    }
    expect(PT.title).toBe("Em que lado queres jogar nesta aula?");
    expect(I18N).toContain('import calendarEn from "../../../../src/locales/en/calendar.json"');
    expect(I18N).toContain('import calendarPt from "../../../../src/locales/pt/calendar.json"');
  });

  it("declares join-side only now that the picker exists (see capabilities.test.ts)", () => {
    expect(read("src/lib/api.ts")).toContain('"join-side"');
  });
});
