/* Comunicação — automation rules first, conversations second. */
const THREADS = [
  { name: "Inês Neuparth", time: "17:05", state: "unread", preview: "Sim, consigo ir na quarta às 12:00",
    actions: [{ label: "Responder" }, { label: "Inscrever na Aula 10", tone: "done" }] },
  { name: "Barbara Malafaya", time: "17:00", state: "waiting", preview: "Convite para Aula 12 · sem resposta",
    actions: [{ label: "2 chamadas · há 3 dias", tone: "attention" }] },
  { name: "Filipa Cruz", time: "17:00", state: "waiting", preview: "Convite para Aula 12 · sem resposta",
    actions: [{ label: "2 chamadas · há 3 dias", tone: "attention" }] },
  { name: "João Miguel Maia", time: "ter", state: "resolved", preview: "Inscrito na Aula 7",
    actions: [{ label: "Resolvido", tone: "done" }] },
  { name: "Tiago Pipe", time: "seg", state: "declined", preview: "Convite recusado", actions: [] }
];

function Mensagens() {
  const [tab, setTab] = React.useState("auto");
  const [rules, setRules] = React.useState({ vaga: true, reenviar: true, lembrete: true, resumo: false });
  const set = k => v => setRules(r => ({ ...r, [k]: v }));
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <ScreenHeader title="Comunicação" user="Bernardo Teles" />
      <div style={{ padding: "0 var(--space-5) var(--space-4)" }}>
        <SegmentedControl value={tab} onChange={setTab}
          options={[{ value: "auto", label: "Automações" }, { value: "chat", label: "Conversas", count: 1 }]} />
      </div>

      {tab === "auto" ? (
        <div style={{ padding: "0 var(--space-5) var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <AutomationRow title="Convite de vaga livre"
            rule="48h antes da aula, para jogadores do nível certo em lista de espera"
            enabled={rules.vaga} onToggle={set("vaga")}
            stats={[{ value: 31, label: "enviados" }, { value: 22, label: "aceites", tone: "done" }, { value: 9, label: "sem resposta", tone: "attention" }]} />
          <AutomationRow title="Reenviar sem resposta"
            rule="Uma vez, 24h depois do convite. Depois disso passa a ti."
            enabled={rules.reenviar} onToggle={set("reenviar")}
            template="“Olá {nome}, ainda não tive resposta — tens vaga para a aula de {nível} {dia} às {hora}?”" />
          <AutomationRow title="Lembrete de aula" rule="Manhã do dia anterior, a quem está inscrito"
            enabled={rules.lembrete} onToggle={set("lembrete")} />
          <AutomationRow title="Resumo semanal ao jogador" rule="Domingo · aulas da semana e avaliação"
            enabled={rules.resumo} onToggle={set("resumo")} />
          <button type="button" style={{
            padding: "var(--space-4)", borderRadius: "var(--radius-xl)", border: "1px dashed var(--border-strong)",
            background: "transparent", color: "var(--text-accent)", font: "var(--text-body-strong)", cursor: "pointer"
          }}>+ Nova automação</button>
        </div>
      ) : (
        <div style={{ padding: "0 var(--space-5) var(--space-5)" }}>
          <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-2xl)", overflow: "hidden", display: "flex", flexDirection: "column", gap: 1, background: "var(--border-subtle)" }}>
            {THREADS.map(t => <MessageRow key={t.name} {...t} />)}
          </div>
        </div>
      )}
    </div>
  );
}
