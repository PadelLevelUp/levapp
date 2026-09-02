Use `Card` for one object or one decision. A list of cards uses borders, not shadows.

```jsx
<Card accent="attention">
  <div style={{ font: "var(--text-title)" }}>Aula 12 tem 9 vagas</div>
</Card>
<Card tone="inverse">…next class hero…</Card>
```

- `floating` is rare: modals, popovers, device frames. Never on a list item.
- The accent bar is only for the action queue — it means "this is waiting on you". Do not use it as decoration.
