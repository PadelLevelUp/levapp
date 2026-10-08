// PAD-508 (classes.create rule 8b): the desktop class-time field. A typeable field with a 15-minute
// list; it always holds a valid HH:MM — text that does not parse puts the last valid time back, so the
// time can never be left empty or fall back to zero.
import * as React from "react";
import { Clock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const STEP = 15;
const FIRST = 6 * 60; // 06:00
const LAST = 23 * 60 + 45; // 23:45

const pad = (n: number) => String(n).padStart(2, "0");
const toText = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const toMinutes = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));

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
export function endAfterStartMove(prevStart: string, prevEnd: string, nextStart: string): string {
  if (toMinutes(prevEnd) > toMinutes(nextStart)) return prevEnd;
  const length = toMinutes(prevEnd) - toMinutes(prevStart);
  return toText(Math.min(toMinutes(nextStart) + (length > 0 ? length : 60), 23 * 60 + 59));
}

function duration(from: string, to: string): string | null {
  const d = toMinutes(to) - toMinutes(from);
  if (d <= 0) return null;
  const h = Math.floor(d / 60);
  const m = d % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
}

interface TimeSelectProps {
  value: string;
  onChange: (value: string) => void;
  /** End field: the start time. The list starts after it and shows each option's duration. */
  from?: string;
  "data-testid"?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  /** classes.clone (PAD-524): shown while the field is still empty (a clone's start). */
  placeholder?: string;
}

export function TimeSelect({ value, onChange, from, ...rest }: TimeSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const listRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => setDraft(value), [value]);

  const startAt = from ? toMinutes(from) + STEP : FIRST;
  const options: string[] = [];
  for (let m = Math.ceil(startAt / STEP) * STEP; m <= LAST; m += STEP) options.push(toText(m));

  const commit = () => {
    const parsed = parseTime(draft);
    if (parsed) onChange(parsed);
    setDraft(parsed ?? value); // never empty: what does not parse goes back to the last valid time
  };

  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      listRef.current?.querySelector<HTMLElement>("[data-selected=true]")?.scrollIntoView({ block: "center" });
    }, 0);
    return () => clearTimeout(t);
  }, [open]);

  return (
    <Popover open={open} onOpenChange={(next) => { if (!next) commit(); setOpen(next); }}>
      <PopoverTrigger asChild>
        <div className="relative" onClick={(e) => { e.preventDefault(); setOpen(true); }}>
          <Clock className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            {...rest}
            inputMode="numeric"
            className="h-8 w-full rounded-md border border-input bg-background pl-7 pr-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
            value={draft}
            onFocus={() => setOpen(true)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit} // leaving the field commits, list open or not (#544 review)
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault(); // commits the field; never submits a surrounding form
                commit();
                setOpen(false);
              }
            }}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-1" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div ref={listRef} className="max-h-60 overflow-y-auto" data-testid={rest["data-testid"] ? `${rest["data-testid"]}-list` : undefined}>
          {options.map((opt) => {
            const selected = opt === value;
            const d = from ? duration(from, opt) : null;
            return (
              <button
                key={opt}
                type="button"
                data-selected={selected}
                className={cn(
                  "flex w-full items-center justify-between rounded px-2 py-1.5 text-sm tabular-nums hover:bg-accent",
                  selected && "bg-primary/10 font-semibold text-primary",
                )}
                onClick={() => { onChange(opt); setDraft(opt); setOpen(false); }}
              >
                <span>{opt}</span>
                {d ? <span className="text-xs text-muted-foreground">{d}</span> : null}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
