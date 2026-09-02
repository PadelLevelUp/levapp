/* Calendário — the week grid. Status drives treatment; fill and level ride along. */
const WEEK = [
  { day: "SEG", date: 3 }, { day: "TER", date: 4, today: true }, { day: "QUA", date: 5 },
  { day: "QUI", date: 6 }, { day: "SEX", date: 7 }
];

const SLOTS = [
  { time: "09:00", cells: [
    [{ title: "Aula 1", time: "09:00 – 10:30", level: "N3", filled: 15, capacity: 16, status: "done" }],
    [],
    [{ title: "Aula 8", time: "09:00 – 10:30", court: "Campo 1", level: "N3", filled: 16, capacity: 16, status: "scheduled" }],
    [{ title: "Torneio interno", time: "09:00 – 13:00 · evento", status: "event" }],
    [{ title: "Aula 15", time: "09:00 – 10:30", court: "Campo 3", level: "N5", filled: 17, capacity: 17, status: "scheduled" }]
  ]},
  { time: "10:30", cells: [
    [{ title: "Aula 2", time: "10:30 – 12:00", level: "N3", filled: 15, capacity: 16, status: "done" }],
    [{ title: "Aula 5 · agora", time: "10:30 – 12:00", court: "Campo 2", level: "N3", filled: 12, capacity: 16, status: "now" }],
    [],
    [{ title: "Aula 12", time: "10:30 – 12:00 · faltam 9", level: "N4-", filled: 7, capacity: 16, status: "needsFilling" }],
    []
  ]},
  { time: "12:00", cells: [
    [{ title: "Aula 3", time: "12:00 – 13:30", level: "N4", filled: 16, capacity: 16, status: "done" }],
    [{ title: "Aula 6", time: "12:00 – 13:30", court: "Campo 1", level: "N4", filled: 15, capacity: 16, status: "scheduled" }],
    [{ title: "Aula 10", time: "12:00 – 13:30", court: "Campo 2", level: "N3", filled: 14, capacity: 16, status: "scheduled" }],
    [{ title: "Aula 13", time: "12:00 – 13:30", court: "Campo 3", level: "N4", filled: 16, capacity: 16, status: "scheduled" }],
    []
  ]}
];

function Calendario({ onOpenInvite }) {
  const line = "1px solid var(--border-subtle)";
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <ScreenHeader title="Calendário" meta="Semana 3–9 agosto" user="Bernardo Teles"
        actions={<Button variant="ghost" size="sm">Hoje</Button>} />
      <div style={{ padding: "0 var(--space-5) var(--space-5)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "56px repeat(5, 1fr)", borderTop: line, borderLeft: line, borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
          <div style={{ background: "var(--surface-sunken)", borderRight: line, borderBottom: line, height: 44 }} />
          {WEEK.map(d => (
            <div key={d.date} style={{
              background: d.today ? "var(--surface-accent-soft)" : "var(--surface-sunken)",
              borderRight: line, borderBottom: line, height: 44,
              display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--space-2)",
              font: "var(--text-label)", color: d.today ? "var(--text-accent)" : "var(--text-secondary)"
            }}>
              {d.day}
              {d.today
                ? <span style={{ width: 24, height: 24, borderRadius: "var(--radius-pill)", background: "var(--action-primary)", color: "#fff", display: "grid", placeItems: "center", font: "600 12px/1 var(--font-body)" }}>{d.date}</span>
                : <span style={{ color: "var(--text-primary)" }}>{d.date}</span>}
            </div>
          ))}
          {SLOTS.map(slot => (
            <React.Fragment key={slot.time}>
              <div style={{ borderRight: line, borderBottom: line, padding: "var(--space-2)", font: "400 12px/1.3 var(--font-body)", color: "var(--text-tertiary)", fontVariantNumeric: "var(--numeric-tabular)" }}>{slot.time}</div>
              {slot.cells.map((cell, i) => (
                <div key={i} style={{
                  borderRight: line, borderBottom: line, padding: 6, minHeight: 74,
                  display: "flex", gap: 6,
                  background: WEEK[i].today ? "var(--surface-accent-soft)" : cell.length ? "transparent" : "var(--surface-sunken)"
                }}>
                  {cell.map((c, j) => (
                    <ClassBlock key={j} {...c} style={{ flex: 1 }}
                      onClick={c.status === "needsFilling" ? onOpenInvite : undefined} />
                  ))}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
        <div style={{ display: "flex", gap: "var(--space-5)", flexWrap: "wrap", marginTop: "var(--space-4)" }}>
          {[["var(--action-primary)", "Cheia / a decorrer", "solid"],
            ["var(--status-attention-solid)", "Vagas por preencher", "dashed"],
            ["var(--lv-grey-100)", "Concluída", "muted"],
            ["var(--status-progress-solid)", "Evento", "solid"]].map(([c, label, kind]) => (
            <span key={label} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", font: "var(--text-caption)", color: "var(--text-secondary)" }}>
              <span style={{
                width: 22, height: 22, borderRadius: "var(--radius-sm)",
                background: kind === "dashed" ? "var(--surface-card)" : c,
                border: kind === "dashed" ? `1.5px dashed ${c}` : kind === "muted" ? "1px solid var(--border-default)" : "none"
              }} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
