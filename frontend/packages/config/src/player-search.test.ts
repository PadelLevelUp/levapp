import { describe, expect, it } from "vitest";
import { searchMessages, searchPeopleByName, searchRoster } from "./player-search";

// players.search (PAD-665): the shared call sites.
const p = (playerId: number, name: string, extra: { email?: string; phone?: string } = {}) => ({
  playerId,
  name,
  ...extra,
});

describe("searchRoster", () => {
  it("[PLAYERS-SEARCH-1] finds 'rui basto' → 'Rui Pedro Basto' and 'andre' → 'André'", () => {
    const roster = [p(1, "Rui Pedro Basto"), p(2, "André Nunes")];
    expect(searchRoster(roster, "rui basto")).toEqual([roster[0]]);
    expect(searchRoster(roster, "andre")).toEqual([roster[1]]);
  });

  it("[PLAYERS-SEARCH-2] lists the best match first and keeps a blank query in the given order", () => {
    const roster = [p(1, "Ana Rita"), p(2, "Rita Zé")];
    expect(searchRoster(roster, "rita").map((r) => r.playerId)).toEqual([2, 1]);
    expect(searchRoster(roster, "").map((r) => r.playerId)).toEqual([1, 2]);
  });

  it("[PLAYERS-SEARCH-3] searches email and phone only where the row carries them", () => {
    const roster = [p(1, "Ana", { email: "ana.rita@x.pt", phone: "+351 912 345 678" }), p(2, "Bruno")];
    expect(searchRoster(roster, "345 678").map((r) => r.playerId)).toEqual([1]);
    // Decision 2026-10-14 (b): the email's local part matches, its domain never does.
    expect(searchRoster(roster, "anarita").map((r) => r.playerId)).toEqual([1]);
    expect(searchRoster(roster, "x.pt").map((r) => r.playerId)).toEqual([]);
  });

  it("[PLAYERS-SEARCH-5] never returns a row that was not passed in", () => {
    expect(searchRoster([p(1, "Ana")], "bruno")).toEqual([]);
  });
});

describe("searchPeopleByName", () => {
  const people = [{ name: "Ana Rita" }, { name: "Rita Zé" }, { name: "Rui Pedro Basto" }, { name: "André" }];
  const nameOf = (x: { name: string }) => x.name;

  it("[PLAYERS-SEARCH-1] coach: 'rui basto' finds 'Rui Pedro Basto', 'andre' finds 'André', best first", () => {
    expect(searchPeopleByName(people, "rui basto", nameOf, { coach: true })).toEqual([people[2]]);
    expect(searchPeopleByName(people, "andre", nameOf, { coach: true })).toEqual([people[3]]);
    expect(searchPeopleByName(people, "rita", nameOf, { coach: true })).toEqual([people[1], people[0]]);
  });

  it("coach: a blank query keeps the order", () => {
    expect(searchPeopleByName(people, "", nameOf, { coach: true })).toEqual(people);
  });

  it("student: the plain substring match and the original order, unchanged", () => {
    expect(searchPeopleByName(people, "rita", nameOf, { coach: false })).toEqual([people[0], people[1]]);
    expect(searchPeopleByName(people, "RUI BASTO", nameOf, { coach: false })).toEqual([]);
    expect(searchPeopleByName(people, "andre", nameOf, { coach: false })).toEqual([]);
    expect(searchPeopleByName(people, "", nameOf, { coach: false })).toEqual(people);
  });
});

describe("searchPeopleByName: the nickname option (PAD-683)", () => {
  const people = [{ name: "Rui Pedro Basto", nick: "Tigre" }, { name: "Ana Rita", nick: null }];
  const nameOf = (x: { name: string }) => x.name;

  it("[PLAYERS-NICKNAME-3] coach: either name finds the row; a student's list ignores the nickname", () => {
    const nicknameOf = (x: { nick: string | null }) => x.nick;
    expect(searchPeopleByName(people, "tigre", nameOf, { coach: true, nicknameOf })).toEqual([people[0]]);
    expect(searchPeopleByName(people, "rui", nameOf, { coach: true, nicknameOf })).toEqual([people[0]]);
    expect(searchPeopleByName(people, "tigre", nameOf, { coach: false, nicknameOf })).toEqual([]);
  });
});

describe("searchMessages (messaging.conversations rule 20, PAD-831)", () => {
  const conv = (id: string, participantId: string | null, participantName: string | null) => ({
    id,
    participantId,
    participantName,
  });
  const nameOf = (c: { participantName: string | null }) => c.participantName ?? "gone";
  const ids = (r: { conversations: { id: string }[]; people: { id: string | number }[] }) => ({
    rows: r.conversations.map((c) => c.id),
    start: r.people.map((x) => x.id),
  });

  it("[MESSAGING-CONVERSATIONS-36] the messages search reads the real name and the roster nickname", () => {
    const conversations = [conv("c1", "1", "Jorge chato")];
    // The people's ids arrive as numbers (`serialize_user_public`), the rows' as strings.
    const people = [{ id: 1, name: "Jorge Silva" }, { id: 2, name: "José Pinto" }];
    const roster = [
      { userId: "1", name: "Jorge Silva", nickname: "Jorge chato" },
      { userId: "2", name: "José Pinto", nickname: "Zé" },
    ];
    const find = (q: string, rows: typeof roster = roster) =>
      ids(searchMessages(conversations, q, nameOf, { coach: true, people, roster: rows }));
    for (const q of ["jorge silva", "chato"]) expect(find(q), q).toEqual({ rows: ["c1"], start: [] });
    for (const q of ["ze", "pinto"]) expect(find(q), q).toEqual({ rows: [], start: [2] });
    // Before the roster arrives, the person's own name still finds the row.
    expect(find("jorge silva", [])).toEqual({ rows: ["c1"], start: [] });
    // A nickname kept off the name finds the loaded row too.
    const kept = [conv("c2", "2", "José Pinto")];
    expect(ids(searchMessages(kept, "ze", nameOf, { coach: true, people, roster })).rows).toEqual(["c2"]);
  });

  it("[MESSAGING-CONVERSATIONS-37] a loaded conversation hides its start row and comes first", () => {
    const conversations = [conv("c1", "1", "Rita Zé"), conv("c9", null, null)];
    const people = [{ id: 2, name: "Ana Rita" }, { id: 1, name: "Rita Zé" }, { id: 3, name: "Rita Alves" }];
    const opts = { coach: true, people };
    expect(ids(searchMessages(conversations, "rita", nameOf, opts))).toEqual({ rows: ["c1"], start: [3, 2] });
    expect(ids(searchMessages(conversations, " ", nameOf, opts))).toEqual({ rows: ["c1", "c9"], start: [] });
  });

  it("[MESSAGING-CONVERSATIONS-41] a roster student outside the messageable list is not offered", () => {
    const roster = [
      { userId: "7", name: "Nuno Novo", nickname: null },
      { userId: "8", name: "Bia Bloco", nickname: null },
    ];
    for (const q of ["nuno", "bia"]) {
      expect(ids(searchMessages([], q, nameOf, { coach: true, people: [], roster })), q).toEqual({ rows: [], start: [] });
    }
  });

  it("[MESSAGING-CONVERSATIONS-40] a student's search reaches their rows only", () => {
    const people = [{ id: 2, name: "Rui Basto" }];
    const r = searchMessages([conv("c1", "1", "Rui Pedro Basto")], "rui basto", nameOf, { coach: false, people });
    expect(ids(r)).toEqual({ rows: [], start: [] });
  });
});
