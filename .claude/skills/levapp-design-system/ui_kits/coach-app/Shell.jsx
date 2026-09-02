/* Shell — the phone frame, tab bar, and theme switch that hold the screens. */
const TABS = [
  { value: "painel", label: "Painel", icon: <Icon name="painel" /> },
  { value: "calendario", label: "Calendário", icon: <Icon name="calendario" /> },
  { value: "jogadores", label: "Jogadores", icon: <Icon name="jogadores" /> },
  { value: "treino", label: "Treino", icon: <Icon name="treino" /> },
  { value: "mensagens", label: "Mensagens", icon: <Icon name="mensagens" />, badge: 1 },
  { value: "definicoes", label: "Definições", icon: <Icon name="definicoes" /> }
];

function Treino() {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <ScreenHeader title="Treino" meta="Biblioteca de exercícios" user="Bernardo Teles" />
      <div style={{ padding: "0 var(--space-5) var(--space-5)" }}>
        <Card tone="sunken" padding="var(--space-6)" style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", alignItems: "flex-start" }}>
          <Badge tone="progress">Por desenhar</Badge>
          <span style={{ font: "var(--text-body)", color: "var(--text-secondary)" }}>
            O ecrã de treino não existe no produto actual — está definido no plano de redesign
            (biblioteca de exercícios e planos de sessão, ligada a uma aula) mas ainda não foi
            desenhado. Deixado em branco de propósito, em vez de inventado.
          </span>
        </Card>
      </div>
    </div>
  );
}

function Definicoes({ theme, onTheme }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <ScreenHeader title="Definições" user="Bernardo Teles" />
      <div style={{ padding: "0 var(--space-5) var(--space-5)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <Eyebrow>Aparência</Eyebrow>
        <Card padding="var(--space-4)">
          <Toggle checked={theme === "dark"} onChange={v => onTheme(v ? "dark" : "light")} label="Modo escuro" />
        </Card>
        <Eyebrow>Conta</Eyebrow>
        <Card padding="var(--space-4)" style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <Avatar name="Bernardo Teles" tone="inverse" size="lg" />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ font: "var(--text-title)" }}>Bernardo Teles</span>
            <span style={{ font: "var(--text-caption)", color: "var(--text-tertiary)" }}>Treinador · Academia</span>
          </div>
        </Card>
        <Card padding="var(--space-4)" style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <span style={{ flex: 1, font: "var(--text-body-strong)" }}>Terminar sessão</span>
          <Button variant="danger" size="sm">Sair</Button>
        </Card>
      </div>
    </div>
  );
}

function Shell() {
  const [tab, setTab] = React.useState("painel");
  const [theme, setTheme] = React.useState("light");
  const [sheet, setSheet] = React.useState(false);

  React.useEffect(() => { document.body.dataset.theme = theme; }, [theme]);

  const screen =
    tab === "painel" ? <Painel onOpenInvite={() => setSheet(true)} onOpenClass={() => setTab("calendario")} />
    : tab === "calendario" ? <Calendario onOpenInvite={() => setSheet(true)} />
    : tab === "jogadores" ? <Jogadores />
    : tab === "mensagens" ? <Mensagens />
    : tab === "treino" ? <Treino />
    : <Definicoes theme={theme} onTheme={setTheme} />;

  const wide = tab === "calendario";

  return (
    <div data-theme={theme} style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, width: 190, paddingTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="../../assets/logo/levapp-icon.svg" width="40" height="40" style={{ borderRadius: "23%" }} alt="LevApp" />
          <span style={{ font: "700 22px/1 var(--font-display)", letterSpacing: "-0.02em", color: theme === "dark" ? "#F2F6FC" : "var(--lv-navy-800)" }}>
            Lev<span style={{ color: theme === "dark" ? "var(--lv-blue-400)" : "var(--lv-blue-600)" }}>App</span>
          </span>
        </div>
        <span style={{ font: "var(--text-caption)", color: theme === "dark" ? "#7E90AB" : "var(--text-tertiary)" }}>
          UI kit do treinador. Toca nos separadores; “Convidar” abre o fluxo de preencher uma aula.
        </span>
        <SegmentedControl value={theme} onChange={setTheme}
          options={[{ value: "light", label: "Claro" }, { value: "dark", label: "Escuro" }]} />
      </div>

      <div style={{
        width: wide ? 720 : 392, height: 760, position: "relative", overflow: "hidden",
        borderRadius: "var(--radius-phone)", background: "var(--surface-page)",
        border: "1px solid var(--border-default)", boxShadow: "var(--shadow-lg)",
        display: "flex", flexDirection: "column", transition: "width var(--duration-slow) var(--ease-out)"
      }}>
        <div style={{ flex: 1, overflowY: "auto" }}>{screen}</div>
        <TabBar items={TABS} value={tab} onChange={setTab} />
        {sheet && <ConvidarSheet onClose={() => setSheet(false)} />}
      </div>
    </div>
  );
}
