/**
 * settings.save-on-change rule 3 (PAD-473): the one record every save-on-change control, on web and
 * iOS, rolls back from. Per field it keeps the value the server last confirmed and which save is the
 * newest:
 * - `seed(values)` takes a read (the loaded settings) for fields no save has touched yet — a read that
 *   started before a write must not replace what the write confirmed (B-184's guard, for this record).
 * - `begin(patch)` starts a save and makes it the newest for its fields.
 * - `confirm(token, answer?)` records the confirmed value (the server's answer when it carries the
 *   field) — only for a save newer, in sending order, than the last confirmed one, so a late answer
 *   never moves the record back. `show` is what the control must now display: a field whose newest
 *   save already failed shows what this confirmation stored.
 * - `fail(token)` returns what to display when the failed save is the newest for a field: the
 *   confirmed value. An older save's failure shows nothing; the newer save decides.
 * Framework-free, so both shells and their tests use the same rules.
 */
export type SaveToken<V> = { readonly seqs: Readonly<Record<string, number>>; readonly patch: Partial<V> };

export class SaveLedger<V extends object> {
  private confirmed: Partial<V> = {};
  private next = 0;
  private newest: Record<string, number> = {};
  private confirmedSeq: Record<string, number> = {};
  private newestFailed: Record<string, boolean> = {};

  seed(values: Partial<V>): void {
    for (const f of Object.keys(values) as (keyof V & string)[]) {
      if (this.newest[f] === undefined) this.confirmed[f] = values[f];
    }
  }

  confirmedValue<K extends keyof V>(field: K): V[K] | undefined {
    return this.confirmed[field];
  }

  /** A save of this field has begun on this screen (a read must not replace what the screen shows). */
  touched(field: keyof V & string): boolean {
    return this.newest[field] !== undefined;
  }

  /** A save of this field newer than the last confirmed one is still out (and has not failed): what the
   * screen shows for it is that save's value, not a read's or an older answer's. */
  newerSaveOut(field: keyof V & string): boolean {
    const newest = this.newest[field];
    return newest !== undefined && newest > (this.confirmedSeq[field] ?? 0) && !this.newestFailed[field];
  }

  begin(patch: Partial<V>): SaveToken<V> {
    const seq = ++this.next;
    const seqs: Record<string, number> = {};
    for (const f of Object.keys(patch)) {
      seqs[f] = seq;
      this.newest[f] = seq;
      this.newestFailed[f] = false;
    }
    return { seqs, patch };
  }

  confirm(token: SaveToken<V>, answer?: Partial<V>): { advanced: Partial<V>; show: Partial<V> } {
    const advanced: Partial<V> = {};
    const show: Partial<V> = {};
    for (const [f, seq] of Object.entries(token.seqs) as [keyof V & string, number][]) {
      if (seq <= (this.confirmedSeq[f] ?? 0)) continue;
      this.confirmedSeq[f] = seq;
      const value = answer && f in answer && answer[f] !== undefined ? answer[f] : token.patch[f];
      this.confirmed[f] = value;
      advanced[f] = value;
      if (this.newestFailed[f]) show[f] = value;
    }
    return { advanced, show };
  }

  fail(token: SaveToken<V>): Partial<V> {
    const show: Partial<V> = {};
    for (const [f, seq] of Object.entries(token.seqs) as [keyof V & string, number][]) {
      if (this.newest[f] !== seq) continue;
      this.newestFailed[f] = true;
      if (f in this.confirmed) show[f] = this.confirmed[f];
    }
    return show;
  }
}
