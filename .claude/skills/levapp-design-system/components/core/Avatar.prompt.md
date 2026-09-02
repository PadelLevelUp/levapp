`Avatar` renders a player or coach; `AvatarStack` shows who is in a class.

```jsx
<Avatar name="Inês Neuparth" tone="accent" />
<AvatarStack people={["Inês Neuparth","Barbara Malafaya","Filipa Cruz"]} overflowLabel="+9" ringColor="var(--lv-navy-700)" />
```

Always set `ringColor` to the surface the stack sits on, or the overlap reads as dirt. Pair a stack with the tabular count ("12/16") — the stack is texture, the number is the fact.
