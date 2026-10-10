// PAD-508 (classes.create rule 8b): the desktop class-time field. A typeable field with a 15-minute
// list; it always holds a valid HH:MM — text that does not parse puts the last valid time back, so the
// time can never be left empty or fall back to zero.
//
// PAD-559 (rule 8c): the list is a combobox that works with the wheel, the trackpad, the keyboard and
// the finger. It is NOT portaled: the sheet is a Radix Dialog whose scroll lock cancels wheel and touch
// scrolling on anything outside it, which with macOS's hidden scrollbar left the list unmovable on
// Safari (the ticket). Rendered inside the field's own tree, the lock lets it scroll.
import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

const STEP = 15;
const FIRST = 6 * 60; // 06:00
const LAST = 23 * 60 + 45; // 23:45
const pad = (n: number) => String(n).padStart(2, "0");
const toText = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const toMinutes = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));
const isHhMm = (v: string) => /^\d{2}:\d{2}$/.test(v);

/** "9", "930", "0930", "9:30", "9h30", "21.15" → "09:30" (etc.); anything else → null. */
export function parseTime(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/[h.]/g, ":");
  let h: number;
  let min: number;
  const colon = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (colon) [h, min] = [Number(colon[1]), Number(colon[2])];
  else if (/^\d{1,2}$/.test(t)) [h, min] = [Number(t), 0];
  else if (/^\d{3,4}$/.test(t)) [h, min] = [Number(t.slice(0, -2)), Number(t.slice(-2))];
  else return null;
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

/**
 * The end after the start moves to `nextStart` (classes.edit rule 7b): unchanged while it is still
 * after the new start, else the new start plus the class's old length (an hour when it had none),
 * never past 23:59.
 */
export function endAfterStartMove(prevStart: string, end: string, nextStart: string): string {
  if (!isHhMm(nextStart)) return end;
  const next = toMinutes(nextStart);
  if (isHhMm(end) && toMinutes(end) > next) return end;
  const length = isHhMm(prevStart) && isHhMm(end) && toMinutes(end) > toMinutes(prevStart) ? toMinutes(end) - toMinutes(prevStart) : 60;
  return toText(Math.min(next + length, 23 * 60 + 59));
}

function duration(from: string, to: string): string | null {
  const d = toMinutes(to) - toMinutes(from);
  if (d <= 0) return null;
  const h = Math.floor(d / 60);
  const m = d % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
}

/** The next quarter hour at or after `now`, on the list's grid, clamped to the list. */
function nextQuarterHour(now: Date): string {
  const m = now.getHours() * 60 + now.getMinutes();
  const q = Math.ceil(m / STEP) * STEP;
  return toText(Math.max(FIRST, Math.min(q, LAST)));
}

interface TimeSelectProps {
  value: string;
  onChange: (value: string) => void;
  /** End field: the start time. The list starts after it and shows each option's duration. */
  from?: string;
  /**
   * End field (PAD-559): the coach's usual class length. A typed end at or before `from` is
   * refused in the field — it snaps to `from` plus this — and `onRefused` is told.
   */
  usualMinutes?: number;
  onRefused?: () => void;
  /** PAD-559: the clock the empty field opens near; tests inject it. */
  now?: () => Date;
  "data-testid"?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  /** classes.clone (PAD-524): shown while the field is still empty (a clone's start). */
  placeholder?: string;
}

let nextId = 0;

export function TimeSelect({ value, onChange, from, usualMinutes, onRefused, now, ...rest }: TimeSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  // The keyboard's highlight: a list index, or null when nothing is highlighted.
  const [active, setActive] = React.useState<number | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const [uid] = React.useState(() => `time-select-${++nextId}`);
  React.useEffect(() => setDraft(value), [value]);

  const startAt = from && isHhMm(from) ? toMinutes(from) + STEP : FIRST;
  const options: string[] = [];
  for (let m = Math.ceil(startAt / STEP) * STEP; m <= LAST; m += STEP) options.push(toText(m));
  const listId = `${uid}-list`;
  const optionId = (i: number) => `${uid}-opt-${i}`;

  /** Rule 8c: an end at or before the start is refused in the field itself. */
  const guard = (parsed: string): string => {
    if (from && isHhMm(from) && toMinutes(parsed) <= toMinutes(from)) {
      onRefused?.();
      const snapped = toText(Math.min(toMinutes(from) + (usualMinutes ?? 60), 23 * 60 + 59));
      return snapped;
    }
    return parsed;
  };

  const commitText = () => {
    const parsed = parseTime(draft);
    const next = parsed ? guard(parsed) : null;
    if (next) onChange(next);
    setDraft(next ?? value); // never empty: what does not parse goes back to the last valid time
  };

  const choose = (opt: string) => {
    onChange(opt);
    setDraft(opt);
    setActive(null);
    setOpen(false);
  };

  const scrollTo = (el: HTMLElement | null | undefined, block: ScrollLogicalPosition) => {
    if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block });
  };

  /**
   * ↑ / ↓ walk the list a quarter hour at a time. With nothing highlighted they start from the
   * typed or current time: ↓ goes to the first option after it, ↑ to the last option before it
   * (a time between two slots therefore lands on the nearer slot in that direction).
   */
  const move = (delta: 1 | -1) => {
    if (options.length === 0) return;
    let i: number;
    if (active !== null) {
      i = Math.min(options.length - 1, Math.max(0, active + delta));
    } else {
      const base = parseTime(draft) ?? (isHhMm(value) ? value : null);
      if (base === null) i = delta > 0 ? 0 : options.length - 1;
      else {
        const m = toMinutes(base);
        if (delta > 0) {
          const next = options.findIndex((o) => toMinutes(o) > m);
          i = next === -1 ? options.length - 1 : next;
        } else {
          let prev = -1;
          options.forEach((o, k) => { if (toMinutes(o) < m) prev = k; });
          i = prev === -1 ? 0 : prev;
        }
      }
    }
    setActive(i);
    setDraft(options[i]);
    setOpen(true);
    scrollTo(listRef.current?.querySelector<HTMLElement>(`#${optionId(i)}`), "nearest");
  };

  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const list = listRef.current;
      if (!list) return;
      // Opens at the current value; an empty field (a clone's start, rule 8b) opens near NOW,
      // never at 06:00 (rule 8c).
      const target =
        list.querySelector<HTMLElement>("[data-selected=true]") ??
        (() => {
          const near = nextQuarterHour((now ?? (() => new Date()))());
          const m = toMinutes(near);
          const i = options.findIndex((o) => toMinutes(o) >= m);
          return list.querySelector<HTMLElement>(`#${optionId(i === -1 ? options.length - 1 : i)}`);
        })();
      scrollTo(target, "center");
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => {
    setActive(null);
    setOpen(false);
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={(next) => { if (!next) { commitText(); close(); } else setOpen(true); }}>
      <PopoverPrimitive.Anchor asChild>
        <div className="relative" data-time-select>
          <Clock className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            {...rest}
            inputMode="numeric"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && active !== null ? optionId(active) : undefined}
            className="h-8 w-full rounded-md border border-input bg-background pl-7 pr-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
            value={draft}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)} // a click on an already-focused field reopens the list
            onChange={(e) => { setDraft(e.target.value); setActive(null); }}
            onBlur={commitText} // leaving the field commits, list open or not (#544 review)
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); move(1); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); move(-1); return; }
              if (e.key === "Escape") { e.preventDefault(); setDraft(value); close(); return; }
              if (e.key === "Enter") {
                e.preventDefault(); // commits the field; never submits a surrounding form
                if (active !== null && options[active]) choose(options[active]);
                else { commitText(); close(); }
              }
            }}
          />
          {/* No Portal (rule 8c): inside the dialog's scroll shard the wheel and the finger scroll it. */}
          <PopoverPrimitive.Content
            align="start"
            sideOffset={4}
            onOpenAutoFocus={(e) => e.preventDefault()}
            // Escape keeps the value: Radix would otherwise close through `onOpenChange`, which
            // commits the highlighted draft as if the coach had left the field.
            onEscapeKeyDown={(e) => { e.preventDefault(); setDraft(value); close(); }}
            onInteractOutside={(e) => { if ((e.target as HTMLElement | null)?.closest?.("[data-time-select]")) e.preventDefault(); }}
            className="z-50 w-48 rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none"
          >
            <div
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={rest["aria-label"]}
              className="max-h-60 overflow-y-auto overscroll-contain"
              data-testid={rest["data-testid"] ? `${rest["data-testid"]}-list` : undefined}
            >
              {options.map((opt, i) => {
                const selected = opt === value;
                const highlighted = i === active;
                const d = from ? duration(from, opt) : null;
                return (
                  <button
                    key={opt}
                    id={optionId(i)}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    data-selected={selected}
                    data-highlighted={highlighted || undefined}
                    className={cn(
                      // 44 px rows under a finger (rule 8c); the desktop keeps its density.
                      "flex w-full items-center justify-between rounded px-2 py-1.5 text-sm tabular-nums hover:bg-accent [@media(pointer:coarse)]:min-h-11",
                      selected && "bg-primary/10 font-semibold text-primary",
                      highlighted && "bg-accent",
                    )}
                    onMouseDown={(e) => e.preventDefault()} // keep the field's focus; blur would commit the draft
                    onClick={() => choose(opt)}
                  >
                    <span>{opt}</span>
                    {d ? <span className="text-xs text-muted-foreground">{d}</span> : null}
                  </button>
                );
              })}
            </div>
          </PopoverPrimitive.Content>
        </div>
      </PopoverPrimitive.Anchor>
    </PopoverPrimitive.Root>
  );
}
