/* Painel — the action queue (direction 1b) with the next-class hero pinned on top. */
function Painel({ onOpenClass, onOpenInvite }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <ScreenHeader title="Por resolver" meta="4 itens · terça, 4 agosto" user="Bernardo Teles" />
      <div style={{ padding: "0 var(--space-5) var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>

        <Card tone="inverse" padding="var(--space-5)" style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ font: "var(--text-eyebrow)", letterSpacing: "var(--tracking-eyebrow)", color: "#8FA8CC" }}>A SEGUIR · 10:30</span>
            <Badge tone="accent" size="sm" style={{ background: "rgba(74,155,255,0.18)", color: "#9CC6FF" }}>em 45 min</Badge>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            <span style={{ font: "var(--text-display-md)", letterSpacing: "var(--tracking-display)", color: "#fff" }}>Aula 5</span>
            <span style={{ font: "var(--text-body)", color: "var(--text-on-inverse-muted)" }}>10:30 – 12:00 · Nível 3 · Campo 2</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
            <AvatarStack ringColor="var(--lv-navy-700)" overflowLabel="+9"
              people={[{ name: "Inês Neuparth", tone: "solid" }, { name: "Barbara Malafaya", tone: "solid" }, { name: "Filipa Cruz", tone: "solid" }]} />
            <span style={{ font: "var(--text-caption)", color: "var(--text-on-inverse-muted)", fontVariantNumeric: "var(--numeric-tabular)" }}>12/16</span>
            <span style={{ flex: 1 }} />
            <Button size="sm" onClick={onOpenClass} style={{ background: "var(--lv-blue-500)" }}>Abrir</Button>
          </div>
        </Card>

        <ActionCard accent="attention"
          title="Aula 12 tem 9 vagas"
          detail="quinta 6 ago · 10:30 · Nível 4- · 7/16 inscritos"
          primaryLabel="Convidar 12 jogadores" onPrimary={onOpenInvite}
          secondaryLabel="Depois" />

        <ActionCard accent="accent" person="Inês Neuparth"
          title="Inês Neuparth respondeu"
          detail="“Sim, consigo ir na quarta às 12:00”"
          primaryLabel="Inscrever na Aula 10"
          secondaryLabel="Abrir" />

        <Card padding="var(--space-4)" style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            <span style={{ font: "var(--text-title)" }}>Presenças de amanhã</span>
            <span style={{ font: "var(--text-caption)", color: "var(--text-secondary)" }}>0 de 31 confirmadas</span>
          </div>
          <Button variant="secondary" size="sm">Notificar</Button>
        </Card>

        <Card padding="var(--space-4)" style={{ display: "flex", alignItems: "center", gap: "var(--space-4)" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            <span style={{ font: "var(--text-title)" }}>3230 validações</span>
            <span style={{ font: "var(--text-caption)", color: "var(--text-secondary)" }}>Acumuladas desde março</span>
          </div>
          <Button variant="secondary" size="sm">Rever</Button>
        </Card>

        <Card tone="sunken" padding="var(--space-4)" style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <span style={{ width: 22, height: 22, borderRadius: "var(--radius-pill)", background: "var(--status-done-solid)", color: "#fff", display: "grid", placeItems: "center", font: "700 12px/1 var(--font-body)" }}>✓</span>
          <span style={{ font: "var(--text-body)", color: "var(--text-secondary)" }}>Hoje: 3 aulas, todas com equipa completa</span>
        </Card>
      </div>
    </div>
  );
}
