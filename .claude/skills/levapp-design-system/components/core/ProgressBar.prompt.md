Occupancy indicator.

```jsx
<ProgressBar value={7} max={16} tone="attention" />
```

Never use it alone — a bar without `7/16` beside it in tabular figures is unreadable at a glance. Tone follows the class's status, not its fill level: a class the coach must fix is always `attention`.
