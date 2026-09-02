A player in any list.

```jsx
<PlayerRow name="Abel Salgado" level="3-" hand="Esquerda"
  flags={[{ label: "Sem conta" }]}
  attendance={[true,true,false,true,false,false,true,true]} />

<PlayerRow selectable selected name="Barbara Malafaya" meta="Nível 4- · em espera" />
```

Never show email on a row — it is the least useful field for picking who to invite. Use `meta` in invite lists to state *why* this player is suggested.
