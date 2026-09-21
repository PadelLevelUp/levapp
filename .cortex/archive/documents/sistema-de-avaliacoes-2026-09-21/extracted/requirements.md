# Requirements extracted from the canvas

Each item cites `source.dc.html` by line (`L123`) or by method of the canvas's `Component`
class. Portuguese UI strings are verbatim. **Inferred** marks behaviour the prototype only
implies. **Mock defect** marks prototype behaviour a build must not copy. Items the canvas
leaves undecided are in `open-questions.md`; nothing here is a product decision.

## A. The evaluation record

### AV-001 — An evaluation is one record holding several ratings
`seedRecords()` L497–508; `upsertRating()` L540–549. Shape:
`{ id, studentId, studentName, date, classLabel|null, values: {competencyId: 1..5}, comment, shared }`.
One record groups every competency rated for one player on one occasion, with one note.

### AV-002 — Record identity: player + class-or-none + calendar day
`findRecord()` L535–538. The first rating (or note) of the day for a player in a given class
creates the record; later input the same day merges into it. A different class, or no class,
is a different record. The next day starts a new record. The mock uses the browser's local day.

### AV-003 — Ratings are whole stars, 1 to 5, for every competency
`starsFor()` L571–578. No per-competency scale, no halves, no zero. The evolution chart's
y-axis is fixed to 1–5 (L714). Filled stars use `--status-progress-solid`.

### AV-004 — Tap to save
`upsertRating()` L540–549, `updateComment()` L551–560. A star tap or a note keystroke writes
immediately. No save button, no dirty state. "Concluir avaliação" (L290) only closes the form
(`onCloseNewEval`, L791).

### AV-005 — Only what the coach rated is stored
L545–546. An untouched competency writes nothing; the record's `values` holds only tapped
competencies. Evaluation is optional and partial (L153: "a avaliação continua opcional").

### AV-006 — A rating cannot be cleared
`starsFor()` L571–578: values 1–5 only; tapping the lit star re-saves it. There is no reset and
no way back to unrated. (Open question Q8.)

### AV-007 — One private note per record
"Nota privada (opcional)" L243, L289; `updateComment()` L551–560. The note belongs to the record,
not to a competency. A note with no rating still creates a record (`values: {}`, L556).

### AV-008 — Optional class link
`classLabel` L500–506, L545. Records made from a class carry the class; records made from the
player drawer carry `null` (L698–700). History shows "· Aula 5" only when linked (L332).

## B. Evaluating from a class

### AV-010 — "Avaliações" is a primary action on the class detail
L203–208. Footer order: "Editar", "Notificar", "Lembrar", "Avaliações" (primary). The other three
have no handler in the canvas (inert chrome).

### AV-011 — The class drawer swaps to "Avaliações — {aula}"
L211–216, L783–785. "←" returns to the class detail; "×" and the scrim close the drawer and
collapse the accordion.

### AV-012 — Participant accordion, one open at a time
L221–246; `expandedStudent` is a single id (L626). Row: avatar, name, summary, "+" rotated 45°
when open (L227, L624).

### AV-013 — Row summary
`buildStudentRows()` L621–625. "Sem avaliação" when no *active* competency is rated today in this
class; otherwise "`N`/`M` avaliadas" with `M` = active competencies, `N` = those with a value.

### AV-014 — Expanded row
L229–245. One line per **active** competency (label + five stars), then "Nota privada (opcional)".

### AV-015 — "Gerir competências" is reachable from the evaluation panel, twice
Eyebrow action L218 and ghost button "+ Gerir competências" L250. In the canvas it is reachable
from nowhere else (not the player drawer, not Definições).

## C. Competencies

### AV-020 — Built-in catalogue of 17, in three groups
`COMPETENCIAS` L463–481.
- **Geral:** Técnica, Tática, Consistência
- **Técnica:** Direita, Esquerda, Volley, Bandeja, Víbora, Smash, Saída de vidro, Duplo vidro, Serviço
- **Tática:** Posição defensiva, Posição atacante, Transição, Tomada de decisão, Jogo em dupla

"Técnica" and "Tática" are each both a group and a competency inside "Geral".

### AV-021 — Three active by default
`DEFAULT_ACTIVE` L482: Técnica, Tática, Consistência (the "Geral" group).

### AV-022 — Competencies are switched on and off, never deleted
`toggleCompetency()` L562; modal L363–391. Groups shown in the order Geral, Técnica, Tática,
Personalizada (L682); empty groups hidden (L689). No rename, no delete in the canvas.

### AV-023 — Switching off keeps history
Entry forms list active competencies only (L627, L700); history lists every value in the record
(L730); evolution pills list every competency the player has data for (L703–707).

### AV-024 — Custom competency
L378–386; `addCustomCompetency()` L564–569. "Competência personalizada" → "Nome da competência"
+ "Adicionar". Trimmed; empty ignored; created active, in group "Personalizada". **Mock defect:**
no duplicate-name check.

### AV-025 — Changes apply forward
L387: "As alterações aplicam-se imediatamente às próximas avaliações." Close button "Concluído".

### AV-026 — One competency set per coach
A single `competencies` state (L526) drives the class panel and the player drawer alike.
**Inferred:** the set is the coach's, not per class or per player.

## D. The player's evaluations

### AV-030 — Profile card "Avaliação"
L108–116. "Última avaliação em {d Mmm aaaa}." (`fmtShort()` L531) or "Ainda não há avaliações."

### AV-031 — "Avaliações" primary button on the player profile
L103 → drawer "Avaliações — {nome}" (L258–264), 520 px, sections "Evolução" and "Histórico".

### AV-032 — "Nova avaliação" outside a class
L270–292. Secondary button, hidden while the form is open. Form: active competencies with
stars, "Nota privada (opcional)", "Concluir avaliação". Record has no class (L698–700). Tapping
nothing creates nothing.

### AV-033 — Evolution per competency
L294–317. Filter pills, one per competency with data for this player (L703–707); a line chart
of **monthly averages**, each the mean of that calendar month's ratings rounded to one decimal
(`seriesFor()` L580–591); month labels "Jan"… (no year).

### AV-034 — Three rolling means
`periodAverage()` L593–600; labels L309–311: "Média mensal", "Média semestral", "Média anual" —
mean of raw ratings in the last 1 / 6 / 12 months, one decimal, "—" when none.

### AV-035 — Delta since the first month
L716–719: with two or more monthly points, "↑ +1.5 desde Jan" or "↓ -0.5 desde Jan" — last
monthly mean minus the first ever. **Mock defects:** always green (L314); zero prints "↑ +0".

### AV-036 — Evolution empty state
L318–320: "Ainda sem avaliações registadas para consultar evolução." **Mock defect:** the
selected competency defaults to `bandeja` (L521), is not reset on player change, and the pills
sit inside the has-data card, so a player with data but no Bandeja sees the empty state with no
way to switch. A build defaults to the first competency that has data.

### AV-037 — History
L323–356; L723–734. Newest first. Card: date "· class", then "Partilhar avaliação" or
"✓ Partilhada com o aluno em {data}", then each rated competency with read-only stars, then the
note in italics and quotes. Empty: "Ainda sem avaliações." No edit or delete of a past record.

## E. Sharing with the player

### AV-040 — Evaluations are not visible to the player until shared
`shared: null` on every new record (L545, L556); the note is labelled private. **Inferred**
from the existence of the share flow; the canvas never shows the player's side.

### AV-041 — Step 1: choose what to show
L397–422; `openShare()` L602. Title "Escolhe o que queres mostrar a {primeiro nome}". A checkbox
per competency in the record ("Bandeja — 4/5"), all pre-selected. "Evolução" pills (L753):
"Desde a última avaliação" (default), "Últimos 6 meses", "Último ano", "Não mostrar evolução".
Only if the record has a note: "Incluir comentário do treinador", **off by default**.
Button "Pré-visualizar".

### AV-042 — Step 2: preview
L424–450. Dark card: "Evolução de {nome}", "Avaliação — {mês} {ano}" (L758), stars for the chosen
competencies, evolution line "Bandeja ↑ +1.5", the note if included. "Voltar" / "Partilhar".
**Mock defects:** the evolution line covers only the first selected competency and ignores the
chosen period (L763–772); nothing blocks sharing zero competencies.

### AV-043 — Sharing stores what was shared
`confirmShare()` L609–614: `shared = { at, competencyIds, evoOption, includeComment }`. The card
then reads "✓ Partilhada com o aluno em {data}". No un-share, no re-share.

## F. Reminder setting

### AV-050 — "Frequência de avaliações"
L142–154; L736. Options "Nunca", "Mensalmente" (default, L524), "A cada 2 aulas", "A cada 4 aulas",
"Personalizado" → number field, suffix "aulas", hint "A cada quantas aulas queres ser lembrado",
default 4 (L525). Caption: "O lembrete só ajuda a manter o histórico atualizado — a avaliação
continua opcional." The canvas stores the choice and never uses it.

## G. Shell ideas outside the evaluation system

### AV-060 — Dark mode switch
"Modo escuro" toggle under "Aparência" (L137–140) and a "Claro"/"Escuro" control in the nav
(L44, L779), one shared state.

## I. Edge states and mock defects found in the script

Observations a build has to handle; none is a proposal.

### AV-070 — The class summary ignores ratings under switched-off competencies
L621 vs L506, L482. The seeded record for João in "Aula 5" rates three competencies that are not
active by default, so his row reads "Sem avaliação" although today's record exists; the expanded
row shows empty stars and the note **pre-filled** from that record (L628).

### AV-071 — Every competency can be switched off
`toggleCompetency()` L562 has no guard. With none active, an expanded row and "Nova avaliação" are
note-only and the summary still reads "Sem avaliação".

### AV-072 — No cancel in either modal
"Gerir competências" closes by "Concluído" or the scrim, with every toggle already applied (L364,
L388). The share modal closes only by the scrim or "Partilhar" (L394).

### AV-073 — Two history cards for one date
A class record and a class-less record of the same day are distinct (L619 vs L698–700).

### AV-074 — Chart and figures
Bare chart: polyline, r=4 dots, month labels; no axes, grid, value labels or hover (L301–307). A
single monthly point draws one dot and no delta (L713, L716). Monthly points and deltas round with
`Math.round(x*10)/10` ("3", "+1"); period means use `.toFixed(1)` ("4.0") (L590, L599, L717). The
period cutoff is *now* including time of day, shifted by `setMonth` (L594–595).

### AV-075 — Share selection order is mutable
The selection is a `Set` (L602): re-ticking a competency moves it last, changing which one drives
the single evolution line (L759, L764).

### AV-076 — `shared.at` is a display string
`confirmShare()` stores `fmtShort(today)` — "21 Set 2026" — not an instant (L611).

### AV-077 — Overlays survive a view change; the form survives a drawer close
View change resets only `selectedClass` (L653) while the player drawer and both modals render
outside the view conditionals (L258, L363, L393). Closing the drawer leaves `newEvalOpen` set (L790).

### AV-078 — Unbounded note, client-minted ids, hand-rolled dates, slug mangling
Note field has no limit (L243, L289). Record ids are `'r' + Date.now() + Math.random()` (L545).
Dates come from the canvas's own Portuguese tables (L459–461). Custom-competency slugs drop
accented characters (L567).

### AV-079 — Mock inconsistencies
"12/16" with three participants (L678 vs L484–488); "N3" on the tile vs "Nível 3" in the detail
(L674, L678); nav key `comunicacao` for the label "Mensagens" (L646).

## H. Declared out of scope by the canvas

### AV-090 — "Fora do âmbito"
- Views Painel, Treino, Mensagens (L51–56, L668): "Este ecrã não faz parte do sistema de
  avaliações — não foi construído nesta demonstração."
- Profile cards "Informação" (L117–120) and "Pontos fortes e fracos" (L123–127): "Fora do âmbito
  desta funcionalidade."
- Inert chrome: disabled "Ver presenças", "Ver faltas", "Adicionar a aulas", "Lista de espera",
  "Desassociar" (L99–104); handler-less "Editar" (L95, L204), "Notificar", "Lembrar" (L205–206);
  "Aula 8" (L675).
- Live chrome with no effect: the reminder pills and custom field change state that nothing reads
  (L134–156, L737). The setting is proposed (AV-050); reminder behaviour is not in the canvas.
