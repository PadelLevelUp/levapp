A thread in the inbox.

```jsx
<MessageRow state="unread" name="Inês Neuparth" time="17:05"
  preview="Sim, consigo ir na quarta às 12:00"
  actions={[{label:"Responder"},{label:"Inscrever na Aula 10", tone:"done"}]} />

<MessageRow name="Filipa Cruz" time="17:00" preview="Convite para Aula 12 · sem resposta"
  actions={[{label:"2 chamadas · há 3 dias", tone:"attention"}]} />
```

Automated chases never render as a separate row per send. One row per thread, with the chase count as an `attention` chip.
