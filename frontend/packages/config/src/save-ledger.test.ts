import { describe, expect, it } from "vitest";
import { SaveLedger } from "./save-ledger";

// settings.save-on-change rule 3 (PAD-473): what a control shows after its saves are answered. The
// ledger is the one record every save-on-change control rolls back from, on both clients.

type S = { mode: string; count: number };

describe("SaveLedger", () => {
  it("a failure of the newest save returns the field to the confirmed value", () => {
    const l = new SaveLedger<S>();
    l.seed({ mode: "a" });
    const y = l.begin({ mode: "b" });
    expect(l.fail(y)).toEqual({ mode: "a" });
  });

  it("both held saves fail: back to the value confirmed before them, not the value either one started from", () => {
    const l = new SaveLedger<S>();
    l.seed({ mode: "x" });
    const y = l.begin({ mode: "y" });
    const z = l.begin({ mode: "z" });
    expect(l.fail(y)).toEqual({}); // not the newest: the newer save decides
    expect(l.fail(z)).toEqual({ mode: "x" }); // the value when z started was "y"
  });

  it("the newest fails, then an older one is confirmed: the field shows what the server confirmed", () => {
    const l = new SaveLedger<S>();
    l.seed({ mode: "x" });
    const y = l.begin({ mode: "y" });
    const z = l.begin({ mode: "z" });
    expect(l.fail(z)).toEqual({ mode: "x" });
    expect(l.confirm(y).show).toEqual({ mode: "y" });
    expect(l.confirmedValue("mode")).toBe("y");
  });

  it("an older save confirmed after a newer one does not move the confirmed value back (sending order, not arrival)", () => {
    const l = new SaveLedger<S>();
    l.seed({ mode: "x" });
    const y = l.begin({ mode: "y" });
    const z = l.begin({ mode: "z" });
    expect(l.confirm(z).advanced).toEqual({ mode: "z" });
    expect(l.confirm(y).advanced).toEqual({});
    expect(l.confirmedValue("mode")).toBe("z");
    const w = l.begin({ mode: "w" });
    expect(l.fail(w)).toEqual({ mode: "z" });
  });

  it("an older save failing after a newer one was confirmed shows nothing", () => {
    const l = new SaveLedger<S>();
    l.seed({ mode: "x" });
    const y = l.begin({ mode: "y" });
    const z = l.begin({ mode: "z" });
    l.confirm(z);
    expect(l.fail(y)).toEqual({});
  });

  it("the confirmed value comes from the server's answer when it carries the field", () => {
    const l = new SaveLedger<S>();
    const y = l.begin({ mode: "Y " });
    expect(l.confirm(y, { mode: "y" }).advanced).toEqual({ mode: "y" });
    expect(l.confirmedValue("mode")).toBe("y");
  });

  it("fields are independent: a failure on one never undoes a confirmed other", () => {
    const l = new SaveLedger<S>();
    l.seed({ mode: "x", count: 1 });
    const a = l.begin({ mode: "y" });
    const b = l.begin({ count: 2 });
    l.confirm(b);
    expect(l.fail(a)).toEqual({ mode: "x" });
    expect(l.confirmedValue("count")).toBe(2);
  });

  it("a read never replaces a field once a save of it has begun (B-184's guard, for the confirmed value)", () => {
    const l = new SaveLedger<S>();
    l.seed({ mode: "x" });
    const y = l.begin({ mode: "y" });
    l.confirm(y);
    l.seed({ mode: "x" }); // a read that started before the write lands late
    expect(l.confirmedValue("mode")).toBe("y");
    const z = l.begin({ mode: "z" });
    expect(l.fail(z)).toEqual({ mode: "y" });
  });

  it("a field with no confirmed value yet shows nothing on failure", () => {
    const l = new SaveLedger<S>();
    const y = l.begin({ mode: "y" });
    expect(l.fail(y)).toEqual({});
  });
});
