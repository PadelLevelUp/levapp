/* The fill-a-class flow: open the class, pick who fits, send once. */
const SUGGESTED = [
  { name: "Barbara Malafaya", meta: "Nível 4- · em espera" },
  { name: "Afonso Diegues", meta: "Nível 4- · faltou 2×" },
  { name: "Adriano Lopes", meta: "Nível 4 · sem aula esta semana" },
  { name: "Tiago Pipe", meta: "recusou o último convite", off: true }
];

function ConvidarSheet({ onClose }) {
  const [picked, setPicked] = React.useState(() => new Set(["Barbara Malafaya", "Afonso Diegues", "Adriano Lopes"]));
  const [sent, setSent] = React.useState(false);
  const toggle = name => setPicked(p => { const n = new Set(p); n.has(name) ? n.delete(name) : n.add(name); return n; });
  const filled = 7 + (sent ? picked.size : 0);

  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(11,21,36,0.45)", display: "flex", alignItems: "flex-end", zIndex: 5 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", maxHeight: "92%", overflowY: "auto",
        background: "var(--surface-page)", borderRadius: "var(--radius-phone) var(--radius-phone) 0 0",
        boxShadow: "var(--shadow-lg)"
      }}>
        <div style={{ padding: "var(--space-5)", background: "linear-gradient(150deg, var(--lv-navy-700) 0%, var(--lv-ink-900) 100%)", borderRadius: "var(--radius-phone) var(--radius-phone) 0 0", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
            <button onClick={onClose} style={{ border: "none", background: "transparent", color: "#9CC6FF", font: "18px/1 var(--font-body)", cursor: "pointer", padding: 0 }}>←</button>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ font: "var(--text-display-sm)", color: "#fff" }}>Aula 12</span>
              <span style={{ font: "var(--text-caption)", color: "var(--text-on-inverse-muted)" }}>qui 6 ago · 10:30 · Nível 4-</span>
            </div>
            <Badge size="sm" style={{ background: sent ? "rgba(18,148,107,0.22)" : "rgba(217,131,36,0.22)", color: sent ? "#5FD3AC" : "#F0B970" }}>
              {filled}/16
            </Badge>
          </div>
          <ProgressBar value={filled} max={16} tone="onDark" height={8} />
        </div>

        <div style={{ padding: "var(--space-4) var(--space-5) var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {sent ? (
            <Card padding="var(--space-5)" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", alignItems: "flex-start" }}>
              <Badge tone="done">Enviado a {picked.size} jogadores</Badge>
              <span style={{ font: "var(--text-body)", color: "var(--text-secondary)" }}>
                As respostas aparecem em Por resolver. Sem resposta em 24h, o reenvio automático trata disso.
              </span>
              <Button variant="secondary" onClick={onClose}>Voltar ao painel</Button>
            </Card>
          ) : (
            <React.Fragment>
              <Eyebrow action="Selecionar todos" onAction={() => setPicked(new Set(SUGGESTED.filter(s => !s.off).map(s => s.name)))}>
                Sugeridos · nível 4- e 4
              </Eyebrow>
              <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-2xl)", overflow: "hidden", display: "flex", flexDirection: "column", gap: 1, background: "var(--border-subtle)" }}>
                {SUGGESTED.map(s => (
                  <PlayerRow key={s.name} name={s.name} meta={s.meta} selectable
                    selected={picked.has(s.name)} onSelect={() => toggle(s.name)}
                    style={{ opacity: s.off ? 0.65 : 1 }} />
                ))}
              </div>
              <Card padding="var(--space-4)" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                <Eyebrow>Mensagem</Eyebrow>
                <span style={{ font: "var(--text-caption)", color: "var(--text-primary)" }}>
                  Olá {"{nome}"}, tens vaga para a aula de 4- esta quinta às 10:30. Queres entrar?
                </span>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <FilterPill active>Convite</FilterPill>
                  <FilterPill>Lembrete</FilterPill>
                  <FilterPill>Editar</FilterPill>
                </div>
              </Card>
              <Button size="lg" fullWidth disabled={picked.size === 0} onClick={() => setSent(true)}>
                Enviar a {picked.size} jogadores
              </Button>
            </React.Fragment>
          )}
        </div>
      </div>
    </div>
  );
}
