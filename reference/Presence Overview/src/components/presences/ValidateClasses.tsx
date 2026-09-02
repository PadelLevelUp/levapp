import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Pencil,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  DAY_NAMES,
  RESPONSE_LABEL,
  STATUS_LABEL,
  STUDENT_POOL,
  classes,
  prefillStatus,
  summarize,
  weekLabel,
  type ClassStudent,
  type PadelClass,
  type Status,
  type Response,
} from "@/lib/classes-data";

type Marks = Record<string, Record<string, Status>>;

export function ValidateClasses() {
  const [open, setOpen] = useState(false);
  const [week, setWeek] = useState(0);
  const [validated, setValidated] = useState<string[]>([]);
  const [marks, setMarks] = useState<Marks>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [extras, setExtras] = useState<Record<string, ClassStudent[]>>({});

  const withExtras = (c: PadelClass): PadelClass =>
    extras[c.id]?.length ? { ...c, students: [...c.students, ...extras[c.id]!] } : c;

  const pending = classes.filter((c) => !validated.includes(c.id));
  const active = activeId ? (classes.find((c) => c.id === activeId) ?? null) : null;
  const activeClass = active ? withExtras(active) : null;

  const weekClasses = useMemo(
    () =>
      classes
        .filter((c) => c.weekOffset === week)
        .sort((a, b) => a.dayIndex - b.dayIndex || a.time.localeCompare(b.time))
        .map(withExtras),
    [week, extras],
  );


  const readyIds = weekClasses.filter((c) => summarize(c).ready).map((c) => c.id);

  function markValidated(ids: string[]) {
    setValidated((v) => [...new Set([...v, ...ids])]);
    setSelected((s) => s.filter((id) => !ids.includes(id)));
  }

  function unvalidate(ids: string[]) {
    setValidated((v) => v.filter((id) => !ids.includes(id)));
  }

  const resetAll = () => {
    if (confirm("Reset all validations and start over?")) {
      setValidated([]);
      setSelected([]);
      setMarks({});
      setExtras({});
    }
  };

  function bulkValidate() {
    const chosen = weekClasses.filter((c) => selected.includes(c.id));
    const ready = chosen.filter((c) => summarize(c).ready);
    const needs = chosen.filter((c) => !summarize(c).ready);
    if (ready.length) markValidated(ready.map((c) => c.id));
    if (needs.length) {
      setNotice(
        `${needs.length} class${needs.length > 1 ? "es" : ""} skipped — they have students with no answer and must be reviewed one by one.`,
      );
      setSelected(needs.map((c) => c.id));
    } else {
      setNotice(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-accent px-4 py-3 text-left shadow-sm transition hover:border-primary/60 hover:shadow-md"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <ClipboardCheck className="h-4 w-4" />
        </span>
        <span>
          <span className="block text-lg font-semibold leading-tight text-accent-foreground tabular-nums">
            {pending.length} classes to validate
          </span>
          <span className="block text-xs text-accent-foreground/80 group-hover:underline">
            Review and confirm attendance
          </span>
        </span>
      </button>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            setActiveId(null);
            setNotice(null);
          }
        }}
      >
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
          {activeClass ? (
          <ClassValidation
            padelClass={activeClass}
            marks={marks[activeClass.id] ?? {}}
            onChange={(studentId, status) =>
              setMarks((m) => ({
                ...m,
                [activeClass.id]: { ...(m[activeClass.id] ?? {}), [studentId]: status },
              }))
            }
            onAddStudent={(name) => {
              const id = `${activeClass.id}-extra-${name}`;
              setExtras((e) => {
                const list = e[activeClass.id] ?? [];
                if (list.some((s) => s.id === id)) return e;
                return { ...e, [activeClass.id]: [...list, { id, name, response: "added" }] };
              });
              setMarks((m) => ({
                ...m,
                [activeClass.id]: { ...(m[activeClass.id] ?? {}), [id]: "present" },
              }));
            }}
            onBack={() => setActiveId(null)}
            onValidate={() => {
              markValidated([activeClass.id]);
              setActiveId(null);
            }}
            onUnvalidate={() => {
              unvalidate([activeClass.id]);
              setActiveId(null);
            }}
            isValidated={validated.includes(activeClass.id)}
          />

          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Classes to validate</DialogTitle>
                <DialogDescription>
                  Browse by week and day. Classes where everyone answered can be confirmed in bulk.
                </DialogDescription>
              </DialogHeader>

              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 px-3 py-2">
                <Button variant="ghost" size="icon" onClick={() => setWeek((w) => w - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium">{weekLabel(week)}</span>
                <Button variant="ghost" size="icon" onClick={() => setWeek((w) => w + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelected(readyIds)}
                  disabled={readyIds.length === 0}
                >
                  Select all ready to confirm
                </Button>
                <Button size="sm" onClick={bulkValidate} disabled={selected.length === 0}>
                  Validate selected ({selected.length})
                </Button>
                {selected.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setSelected([])}>
                    Clear
                  </Button>
                )}
              </div>

              {notice && (
                <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/15 px-3 py-2 text-xs text-foreground">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-warning" />
                  {notice}
                </p>
              )}

              <WeekList
                weekClasses={weekClasses.filter((c) => !validated.includes(c.id))}
                selected={selected}
                onToggle={(id) =>
                  setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
                }
                onOpen={setActiveId}
                marks={marks}
                onMark={(classId, studentId, status) =>
                  setMarks((m) => ({
                    ...m,
                    [classId]: { ...(m[classId] ?? {}), [studentId]: status },
                  }))
                }
                onAddStudent={(classId, name) => {
                  const id = `${classId}-extra-${name}`;
                  setExtras((e) => {
                    const list = e[classId] ?? [];
                    if (list.some((s) => s.id === id)) return e;
                    return { ...e, [classId]: [...list, { id, name, response: "added" }] };
                  });
                  setMarks((m) => ({
                    ...m,
                    [classId]: { ...(m[classId] ?? {}), [id]: "present" },
                  }));
                }}
                onValidate={(id) => markValidated([id])}
              />


              {weekClasses.some((c) => validated.includes(c.id)) && (
                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                      Validated this week
                    </h3>
                    <Button variant="ghost" size="sm" onClick={resetAll} className="h-6 text-xs">
                      Reset all
                    </Button>
                  </div>
                  <ul className="space-y-2">
                    {weekClasses
                      .filter((c) => validated.includes(c.id))
                      .map((c) => (
                        <li
                          key={c.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
                        >
                          <span className="flex items-center gap-2 text-muted-foreground">
                            <CheckCircle2 className="h-4 w-4 text-success" />
                            {DAY_NAMES[c.dayIndex]} {c.time} · {c.name}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => unvalidate([c.id])}
                            >
                              Undo
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setActiveId(c.id)}>
                              <Pencil className="mr-1 h-3 w-3" /> Edit
                            </Button>
                          </div>
                        </li>
                      ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function WeekList({
  weekClasses,
  selected,
  onToggle,
  onOpen,
  marks,
  onMark,
  onAddStudent,
  onValidate,
}: {
  weekClasses: PadelClass[];
  selected: string[];
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  marks: Marks;
  onMark: (classId: string, studentId: string, status: Status) => void;
  onAddStudent: (classId: string, name: string) => void;
  onValidate: (id: string) => void;
}) {

  if (weekClasses.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
        Nothing left to validate this week. Nice work.
      </p>
    );
  }

  const groups: { title: string; ready: boolean; items: PadelClass[] }[] = [
    { title: "Needs your input", ready: false, items: weekClasses.filter((c) => !summarize(c).ready) },
    { title: "Ready to confirm", ready: true, items: weekClasses.filter((c) => summarize(c).ready) },
  ];

  return (
    <div className="space-y-5">
      {groups
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <section key={g.title}>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  g.ready ? "bg-success" : "bg-warning",
                )}
              />
              {g.title} ({g.items.length})
            </h3>
            <div className="space-y-3">
              {[...new Set(g.items.map((c) => c.dayIndex))]
                .sort((a, b) => a - b)
                .map((day) => (
                  <div key={day}>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">{DAY_NAMES[day]}</p>
                    <ul className="space-y-2">
                      {g.items
                        .filter((c) => c.dayIndex === day)
                        .sort((a, b) => a.time.localeCompare(b.time))
                        .map((c) => (
                          <ClassCard
                            key={c.id}
                            padelClass={c}
                            selected={selected.includes(c.id)}
                            onToggle={() => onToggle(c.id)}
                            marks={marks[c.id] ?? {}}
                            onMark={(studentId, status) => onMark(c.id, studentId, status)}
                            onAddStudent={(name) => onAddStudent(c.id, name)}
                            onValidate={() => onValidate(c.id)}
                            onOpen={() => onOpen(c.id)}
                          />
                        ))}

                    </ul>
                  </div>
                ))}
            </div>
          </section>
        ))}
    </div>
  );
}

const STATUS_STYLES: Record<Status, string> = {
  present: "data-[on=true]:bg-success data-[on=true]:text-foreground",
  justified: "data-[on=true]:bg-muted data-[on=true]:text-foreground data-[on=true]:border-muted",
  unjustified: "data-[on=true]:bg-danger data-[on=true]:text-danger-foreground",
};

const SHORT_STATUS: Record<Status, string> = {
  present: "Present",
  justified: "Justified",
  unjustified: "Unjustified",
};

function ClassCard({
  padelClass: c,
  selected,
  onToggle,
  marks,
  onMark,
  onAddStudent,
  onValidate,
  onOpen,
}: {
  padelClass: PadelClass;
  selected: boolean;
  onToggle: () => void;
  marks: Record<string, Status>;
  onMark: (studentId: string, status: Status) => void;
  onAddStudent: (name: string) => void;
  onValidate: () => void;
  onOpen: () => void;
}) {
  const [addName, setAddName] = useState("");
  const [adding, setAdding] = useState(false);
  const s = summarize(c);
  const available = STUDENT_POOL.filter((n) => !c.students.some((st) => st.name === n));

  const statusOf = (st: ClassStudent) => marks[st.id] ?? prefillStatus(st.response);
  const rows = [...c.students].sort(
    (a, b) => (statusOf(a) ? 1 : 0) - (statusOf(b) ? 1 : 0),
  );
  const undecided = rows.filter((st) => !statusOf(st)).length;

  return (
    <li
      className={cn(
        "rounded-lg border bg-card px-3 py-2.5 transition hover:shadow-sm",
        undecided > 0 ? "border-warning bg-warning/5" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <Checkbox
          className="mt-1"
          checked={selected}
          onCheckedChange={onToggle}
          aria-label={`Select ${c.name}`}
        />
        <div className="min-w-40 flex-1">
          <p className="text-sm font-medium text-card-foreground">
            <span className="tabular-nums">{c.time}</span> · {c.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {c.type} · {c.court} — {s.total} students · {s.confirmed} confirmed · {s.absent} said
            absent · {s.none} no answer
          </p>
        </div>
        <Button size="sm" onClick={onValidate} disabled={undecided > 0}>
          Validate
        </Button>
        <Button size="sm" variant="outline" onClick={onOpen}>
          <Pencil className="mr-1 h-3 w-3" /> Open
        </Button>
      </div>

      <ul className="mt-2.5 space-y-1.5">
        {rows.map((st) => {
          const current = statusOf(st);
          return (
            <li
              key={st.id}
              className={cn(
                "flex flex-wrap items-center justify-between gap-2 rounded-md border px-2 py-1.5",
                current ? "border-transparent bg-muted/40" : "border-warning bg-warning/10",
              )}
            >
              <span className="flex items-center gap-1.5 text-sm text-card-foreground">
                {st.name}
                {!current ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-warning/60 bg-warning/25 px-1.5 py-0.5 text-[11px] font-semibold text-warning-foreground">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Needs answer
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    · {RESPONSE_LABEL[st.response]}
                  </span>
                )}
              </span>
              <span className="flex gap-1">
                {(Object.keys(SHORT_STATUS) as Status[]).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    data-on={current === opt}
                    onClick={() => onMark(st.id, opt)}
                    className={cn(
                      "rounded-md border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition hover:bg-muted",
                      STATUS_STYLES[opt],
                    )}
                  >
                    {SHORT_STATUS[opt]}
                  </button>
                ))}
              </span>
            </li>
          );
        })}
      </ul>

      {adding ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={addName}
            onChange={(e) => setAddName(e.target.value)}
            className="h-8 min-w-40 flex-1 rounded-md border border-border bg-background px-2 text-sm text-foreground"
          >
            <option value="">Select a player…</option>
            {available.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            disabled={!addName}
            onClick={() => {
              onAddStudent(addName);
              setAddName("");
              setAdding(false);
            }}
          >
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="mt-1 h-7 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setAdding(true)}
        >
          <UserPlus className="mr-1 h-3.5 w-3.5" /> Add player
        </Button>
      )}
    </li>
  );
}



function ClassValidation({
  padelClass,
  marks,
  onChange,
  onAddStudent,
  onBack,
  onValidate,
  onUnvalidate,
  isValidated,
}: {
  padelClass: PadelClass;
  marks: Record<string, Status>;
  onChange: (studentId: string, status: Status) => void;
  onAddStudent: (name: string) => void;
  onBack: () => void;
  onValidate: () => void;
  onUnvalidate?: () => void;
  isValidated: boolean;
}) {
  const [addName, setAddName] = useState("");
  const available = STUDENT_POOL.filter(
    (n) => !padelClass.students.some((s) => s.name === n),
  );

  const rows = [...padelClass.students].sort((a, b) => {
    const rank = (r: string) => (r === "none" ? 0 : 1);
    return rank(a.response) - rank(b.response);
  });

  const statusOf = (studentId: string, response: PadelClass["students"][number]["response"]) =>
    marks[studentId] ?? prefillStatus(response);

  const undecided = rows.filter((s) => !statusOf(s.id, s.response)).length;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {padelClass.time} · {padelClass.name}
        </DialogTitle>
        <DialogDescription>
          {DAY_NAMES[padelClass.dayIndex]} · {padelClass.type} · {padelClass.court}
        </DialogDescription>
      </DialogHeader>

      {undecided > 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-warning bg-warning/20 px-3 py-2 text-sm font-medium text-foreground">
          <AlertTriangle className="h-4 w-4 text-warning" />
          {undecided} student{undecided > 1 ? "s" : ""} still need a decision
        </p>
      ) : (
        <p className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm">
          <CheckCircle2 className="h-4 w-4 text-success" />
          All students have a status — ready to validate
          {isValidated ? " (already validated, editing)" : ""}
        </p>
      )}

      <ul className="space-y-2">
        {rows.map((s) => {
          const current = statusOf(s.id, s.response);
          const needs = !current;
          return (
            <li
              key={s.id}
              className={cn(
                "flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5",
                needs ? "border-warning bg-warning/10" : "border-border bg-card",
              )}
            >
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-card-foreground">
                  {s.name}
                  {needs && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-warning/60 bg-warning/25 px-1.5 py-0.5 text-[11px] font-semibold text-warning-foreground">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Needs answer
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{RESPONSE_LABEL[s.response]}</p>
              </div>
              <div className="flex gap-1">
                {(Object.keys(STATUS_LABEL) as Status[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    data-on={current === st}
                    onClick={() => onChange(s.id, st)}
                    className={cn(
                      "rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted",
                      STATUS_STYLES[st],
                    )}
                  >
                    {STATUS_LABEL[st]}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <UserPlus className="h-3.5 w-3.5" /> Player joined last minute?
        </span>
        <select
          value={addName}
          onChange={(e) => setAddName(e.target.value)}
          className="h-8 flex-1 min-w-40 rounded-md border border-border bg-background px-2 text-sm text-foreground"
        >
          <option value="">Select a player…</option>
          {available.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          disabled={!addName}
          onClick={() => {
            onAddStudent(addName);
            setAddName("");
          }}
        >
          Add to class
        </Button>
      </div>



      <div className="flex items-center justify-end gap-2">
        {isValidated && onUnvalidate && (
          <Button variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={onUnvalidate}>
            Undo validation
          </Button>
        )}
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onValidate} disabled={undecided > 0}>
          {isValidated ? "Save changes" : "Validate class"}
        </Button>
      </div>
    </>
  );
}

const CHIP_STYLES: Record<Response, string> = {
  confirmed: "border-success/40 bg-success/10 text-foreground",
  absent: "border-border bg-muted text-muted-foreground",
  none: "border-warning bg-warning/20 font-semibold text-foreground",
  added: "border-primary/40 bg-primary/10 text-foreground",
};


const CHIP_LABEL: Record<Response, string> = {
  confirmed: "Present",
  absent: "Absent – justified",
  none: "Decision needed",
  added: "Added by coach",
};

function StudentChip({ response, name }: { response: Response; name: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-tight",
        CHIP_STYLES[response],
      )}
    >
      {response === "none" ? (
        <AlertTriangle className="h-3 w-3 text-warning" />
      ) : response === "confirmed" || response === "added" ? (
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
      )}

      <span className="font-medium">{name}</span>
      <span className="opacity-70">· {CHIP_LABEL[response]}</span>
    </span>
  );
}
