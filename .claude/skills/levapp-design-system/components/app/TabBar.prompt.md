Bottom navigation for the coach app.

```jsx
<TabBar value={tab} onChange={setTab} items={[
  { value: "painel", label: "Painel" },
  { value: "calendario", label: "Calendário" },
  { value: "jogadores", label: "Jogadores" },
  { value: "treino", label: "Treino" },
  { value: "mensagens", label: "Mensagens", badge: 1 },
  { value: "definicoes", label: "Definições" }
]} />
```

Six destinations maximum. Badges are counts of things needing the coach, never unread-for-the-sake-of-unread.
