Use `Badge` to show one piece of state on an object — never as decoration or a category colour.

```jsx
<Badge tone="attention">Faltam 9</Badge>
<Badge tone="done">Concluída</Badge>
<Badge tone="progress" size="sm">Nível 3-</Badge>
```

Tone is semantic and fixed: green only ever means done, amber only ever means the coach must act, violet only ever means player-side/level/progress. Never pick a tone for visual variety.
