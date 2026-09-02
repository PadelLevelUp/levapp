/* Jogadores — the list you actually pick invitees from. */
const PLAYERS = [
  { name: "Abel Salgado", level: "3-", hand: "Esquerda", flags: [{ label: "Sem conta" }], attendance: [1,1,0,1,0,0,1,1] },
  { name: "Adriano Lopes", level: "4", hand: "Direita", flags: [], attendance: [1,1,1,1,1,0,1,1] },
  { name: "Afonso Diegues", level: "4-", hand: "Direita", flags: [{ label: "Faltou 2×", tone: "attention" }], attendance: [1,0,0,1,1,0,1,0] },
  { name: "Barbara Malafaya", level: "4-", hand: "Esquerda", flags: [{ label: "Em espera", tone: "accent" }], attendance: [1,1,1,0,1,1,1,1] },
  { name: "Filipa Cruz", level: "3", hand: "Direita", flags: [], attendance: [1,1,1,1,0,1,1,1] },
  { name: "Inês Neuparth", level: "3-", hand: "Direita", flags: [], attendance: [0,1,1,1,1,1,1,1] },
  { name: "João Miguel Maia", level: "5", hand: "Esquerda", flags: [], attendance: [1,1,1,1,1,1,1,1] },
  { name: "Tiago Pipe", level: "4", hand: "Direita", flags: [{ label: "Recusou", tone: "problem" }], attendance: [0,0,1,0,0,1,0,0] }
];

const FILTERS = ["Todos", "Sem conta", "Faltas recentes", "Sem aula esta semana"];

function Jogadores() {
  const [filter, setFilter] = React.useState("Todos");
  const list = filter === "Sem conta" ? PLAYERS.filter(p => p.flags.some(f => f.label === "Sem conta"))
    : filter === "Faltas recentes" ? PLAYERS.filter(p => p.attendance.slice(-4).filter(Boolean).length < 3)
    : filter === "Sem aula esta semana" ? PLAYERS.slice(2, 6)
    : PLAYERS;
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <ScreenHeader title="Jogadores" meta={`${PLAYERS.length} de 166`} user="Bernardo Teles" />
      <div style={{ padding: "0 var(--space-5) var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <Input placeholder="Procurar jogador" prefix={<Icon name="search" size={16} style={{ color: "var(--text-tertiary)" }} />} />
        <div style={{ display: "flex", gap: "var(--space-2)", overflowX: "auto", paddingBottom: 2 }}>
          {FILTERS.map(fl => <FilterPill key={fl} active={fl === filter} onClick={() => setFilter(fl)}>{fl}</FilterPill>)}
        </div>
      </div>
      <div style={{ padding: "0 var(--space-5) var(--space-5)" }}>
        <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-2xl)", overflow: "hidden", display: "flex", flexDirection: "column", gap: 1, background: "var(--border-subtle)" }}>
          {list.map(p => (
            <PlayerRow key={p.name} name={p.name} level={p.level} hand={p.hand} flags={p.flags}
              attendance={p.attendance.map(Boolean)} />
          ))}
          {list.length === 0 && (
            <div style={{ background: "var(--surface-card)", padding: "var(--space-6)", textAlign: "center", font: "var(--text-body)", color: "var(--text-tertiary)" }}>
              Ninguém neste filtro.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
