A rule in the Automações tab.

```jsx
<AutomationRow
  title="Convite de vaga livre"
  rule="48h antes da aula, para jogadores do nível certo em lista de espera"
  stats={[{value:31,label:"enviados"},{value:22,label:"aceites",tone:"done"},{value:9,label:"sem resposta",tone:"attention"}]}
/>
```

A rule without results is not shippable — the coach must be able to see what it produced. Describe the trigger in plain Portuguese, never as a condition builder.
