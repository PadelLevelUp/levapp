The only way to render an icon. Never inline an `<svg>` in a screen or a component.

```jsx
<Icon name="mensagens" size={20} />
<Button iconLeft={<Icon name="plus" size={16} />}>Nova automação</Button>
```

- Colour comes from `currentColor`, so set `color` on the parent, never `fill`.
- 20px in the tab bar, 16px inside buttons and rows, 24px standalone.
- `strokeWidth` stays at 2. A thinner stroke breaks the match with the rest of the set.
- If you need a glyph that is not in `PATHS`, add it from Lucide — do not hand-draw one.
