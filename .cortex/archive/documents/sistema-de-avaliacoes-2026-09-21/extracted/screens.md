# Screens and states in the canvas

Desktop coach web app only. No phone layout, no player-side screen, Portuguese only. `L` = line
of `source.dc.html`. Requirement ids refer to `requirements.md`.

| # | Screen / state | Lines | Shown when | Requirements |
|---|---|---|---|---|
| S1 | Shell: 220 px nav (Painel, Calendário, Jogadores, Treino, Mensagens, Definições) + theme control "Claro"/"Escuro" | L28–46, L641–663 | always | AV-060 |
| S2 | Out-of-scope placeholder: badge "Fora do âmbito" | L51–56 | view = Painel, Treino, Mensagens | AV-090 |
| S3 | Calendário: title, today's date, two class blocks, hint "Toca na Aula 5 para abrir os detalhes." | L58–71, L671–676 | default view | scaffolding |
| S4 | Class drawer — detail: Hora, Capacidade, Nível, Campo; "Participantes (12/16)"; footer Editar · Notificar · Lembrar · **Avaliações** | L161–209 | a class is selected | AV-010 |
| S5 | Class drawer — "Avaliações — Aula 5": header action "Gerir competências", participant accordion, "+ Gerir competências" | L211–252 | "Avaliações" pressed in S4 | AV-011–AV-015 |
| S5a | Participant row collapsed: "Sem avaliação" or "N/M avaliadas" | L223–228, L625 | — | AV-013 |
| S5b | Participant row expanded: star lines for active competencies + "Nota privada (opcional)" | L229–245 | row tapped; one at a time | AV-012, AV-014, AV-003–AV-007 |
| S6 | Modal "Gerir competências": groups Geral / Técnica / Tática / Personalizada, checkboxes, "Competência personalizada" + "Adicionar", caption, "Concluído" | L363–391 | from S5 only | AV-020–AV-026 |
| S7 | Jogadores: player list + profile card (badges "Nível 4-", "Direita"; action row; cards "Avaliação", "Informação", "Pontos fortes e fracos") | L73–132 | view = Jogadores | AV-030, AV-031, AV-090 |
| S7a | Card "Avaliação" with history: "Última avaliação em 21 Set 2026." | L110–112 | player has records | AV-030 |
| S7b | Card "Avaliação" empty: "Ainda não há avaliações." | L113–115 | no records | AV-030 |
| S8 | Player drawer "Avaliações — {nome}": sections "Evolução" and "Histórico" | L258–361 | "Avaliações" pressed in S7 | AV-031 |
| S8a | "Nova avaliação" form: star lines, "Nota privada (opcional)", "Concluir avaliação" | L275–292 | "Nova avaliação" pressed | AV-032 |
| S8b | Evolution card: competency pills, monthly-average line chart, "Média mensal / semestral / anual", delta "↑ +1.5 desde Jan" | L294–317 | selected competency has data | AV-033–AV-035 |
| S8c | Evolution empty: "Ainda sem avaliações registadas para consultar evolução." | L318–320 | no data for the selected competency | AV-036 |
| S8d | History card, not shared: date · class, "Partilhar avaliação", read-only stars, note | L329–354 | record.shared = null | AV-037 |
| S8e | History card, shared: "✓ Partilhada com o aluno em {data}" | L333–335, L731 | record.shared set | AV-043 |
| S8f | History empty: "Ainda sem avaliações." | L325–327 | no records | AV-037 |
| S9 | Share modal step 1: "Escolhe o que queres mostrar a {nome}", competency checkboxes "Bandeja — 4/5", "Evolução" pills ×4, "Incluir comentário do treinador", "Pré-visualizar" | L397–422 | "Partilhar avaliação" pressed | AV-041 |
| S10 | Share modal step 2: "Pré-visualização", dark card "Evolução de {nome}" / "Avaliação — {mês ano}", "Voltar" / "Partilhar" | L424–450 | "Pré-visualizar" pressed | AV-042 |
| S11 | Definições: "Aparência" → "Modo escuro"; "Avaliações" → "Frequência de avaliações" pills ×5, custom "aulas" field, caption | L134–156 | view = Definições | AV-050, AV-060 |

## Navigation

```
Calendário ─ tap Aula 5 → S4 ─ "Avaliações" → S5 ─ "Gerir competências" → S6
                          S5 ─ "←" → S4        S4/S5 ─ "×" or scrim → Calendário
Jogadores  ─ select player → S7 ─ "Avaliações" → S8 ─ "Nova avaliação" → S8a
                                   S8d ─ "Partilhar avaliação" → S9 ─ "Pré-visualizar" → S10
                                   S10 ─ "Voltar" → S9      S10 ─ "Partilhar" → S8e
Definições → S11
```

## Drawers and modals

- Drawers slide from the right over a scrim `rgba(11,21,36,0.45)`: class 460 px, player 520 px,
  both `max-width: 92vw` (L162–163, L259–260). Clicking the scrim closes.
- Modals are centred, 480 px, `max-height: 86vh`, above the drawers (z-index 50 vs 40; L364–365,
  L394–395), so "Gerir competências" opens over the class drawer and the share modal over the
  player drawer.

## Mock data

Players (L489–495): João Silva 4- Direita; Pedro Costa 3 Esquerda; Miguel Santos 5 Direita;
Adriano Lopes 4 Direita; Filipa Cruz 3 Direita. Aula 5 participants (L484–488): João Silva,
Pedro Costa, Miguel Santos. Seed records (L497–508): seven for João Silva — Bandeja 2, 3 (Jan),
3, 3 (Mar), 3, 4 with Posição atacante 3, 3 (Jun), and today's in "Aula 5": Bandeja 4, Posição
atacante 4, Tomada de decisão 3, note "Continua a trabalhar a tomada de decisão no ataque."
