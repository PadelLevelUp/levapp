Use `Button` for every clickable action; there is no other button in the system.

```jsx
<Button variant="primary" onClick={invite}>Convidar 12 jogadores</Button>
<Button variant="ghost">Depois</Button>
```

- One `primary` per view. Everything competing with it becomes `secondary` or `ghost`.
- `danger` is outlined, never filled — destructive actions live in an overflow menu, not in the main flow.
- `quiet` is the inline text action inside a row ("Ver", "Validar").
- `size="md"` (44px) is the mobile default and is not negotiable on touch surfaces.
