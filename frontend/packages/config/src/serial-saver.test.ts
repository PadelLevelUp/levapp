import { describe, expect, it } from "vitest";
import { SaveSuperseded, createSerialSaver, dropPendingSaves } from "./serial-saver";

// settings.save-on-change rule 3 (PAD-473): one save of a field in flight at a time, the latest pending
// value sent when it returns — so the server ends in the order the saves were sent.

function harness() {
  const sent: string[] = [];
  const answers: { value: string; resolve: (v: string) => void; reject: (e: Error) => void }[] = [];
  const save = createSerialSaver<string, string>(
    (value) =>
      new Promise((resolve, reject) => {
        sent.push(value);
        answers.push({ value, resolve, reject });
      }),
  );
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return { save, sent, answers, tick };
}

describe("createSerialSaver", () => {
  it("sends at once when nothing is in flight", () => {
    const h = harness();
    void h.save("a");
    expect(h.sent).toEqual(["a"]);
  });

  it("holds a second value until the first answer, then sends only the latest pending one", async () => {
    const h = harness();
    const a = h.save("a");
    const b = h.save("b");
    const c = h.save("c");
    expect(h.sent).toEqual(["a"]);

    h.answers[0].resolve("A");
    await expect(a).resolves.toBe("A");
    await h.tick();
    expect(h.sent).toEqual(["a", "c"]); // b was replaced while it waited

    h.answers[1].resolve("C");
    await expect(b).resolves.toBe("C"); // b settles with the request that carried a later value
    await expect(c).resolves.toBe("C");
  });

  it("a failure releases the queue: the pending value is still sent, and its caller gets its own outcome", async () => {
    const h = harness();
    const a = h.save("a");
    const b = h.save("b");
    h.answers[0].reject(new Error("offline"));
    await expect(a).rejects.toThrow("offline");
    await h.tick();
    expect(h.sent).toEqual(["a", "b"]);
    h.answers[1].resolve("B");
    await expect(b).resolves.toBe("B");
  });

  it("never has two requests in flight", async () => {
    const h = harness();
    for (const v of ["a", "b", "c", "d"]) void h.save(v);
    expect(h.sent).toEqual(["a"]);
    h.answers[0].resolve("A");
    await h.tick();
    expect(h.sent).toEqual(["a", "d"]);
  });

  it("merge combines a pending patch with the next one", async () => {
    const sent: object[] = [];
    let release!: () => void;
    const save = createSerialSaver<Record<string, number>, void>(
      (v) => new Promise<void>((res) => { sent.push(v); release = res; }),
      (pending, next) => ({ ...pending, ...next }),
    );
    void save({ x: 1 });
    void save({ y: 2 });
    void save({ x: 3 });
    release();
    await new Promise((r) => setTimeout(r, 0));
    expect(sent).toEqual([{ x: 1 }, { y: 2, x: 3 }]);
  });

  it("busy() is true while a request is out or a value waits, false once all have settled", async () => {
    const h = harness();
    expect(h.save.busy()).toBe(false);
    h.save("a").catch(() => undefined); // it fails below; its caller handles that
    void h.save("b");
    expect(h.save.busy()).toBe(true);
    h.answers[0].reject(new Error("x"));
    await h.tick();
    expect(h.save.busy()).toBe(true); // b is out now
    h.answers[1].resolve("B");
    await h.tick();
    expect(h.save.busy()).toBe(false);
  });

  it("drop() discards the waiting value: it is never sent and its callers learn it was superseded", async () => {
    const h = harness();
    const a = h.save("a");
    const b = h.save("b");
    h.save.drop();
    await expect(b).rejects.toBeInstanceOf(SaveSuperseded);
    h.answers[0].resolve("A");
    await expect(a).resolves.toBe("A");
    await h.tick();
    expect(h.sent).toEqual(["a"]);
    expect(h.save.busy()).toBe(false);
  });

  it("dropPendingSaves() (sign-out) discards what waits in every saver, and nothing after", async () => {
    const one = harness();
    const two = harness();
    void one.save("a1");
    const waiting1 = one.save("b1");
    void two.save("a2");
    const waiting2 = two.save("b2");
    dropPendingSaves();
    await expect(waiting1).rejects.toBeInstanceOf(SaveSuperseded);
    await expect(waiting2).rejects.toBeInstanceOf(SaveSuperseded);
    one.answers[0].resolve("A1");
    two.answers[0].resolve("A2");
    await one.tick();
    expect(one.sent).toEqual(["a1"]);
    expect(two.sent).toEqual(["a2"]);
    const later = one.save("c1"); // a save made after sign-in again goes normally
    one.answers[1].resolve("C1");
    await expect(later).resolves.toBe("C1");
  });
});
