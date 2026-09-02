# Component Patterns

## Props

Type all props. Destructure in the function signature:

```typescript
interface PlayerCardProps {
  player: CoachPlayer;
  onSelect: (id: string) => void;
}

export function PlayerCard({ player, onSelect }: PlayerCardProps) {
  return (
    <Card onClick={() => onSelect(player.id)}>
      <CardHeader>{player.name}</CardHeader>
    </Card>
  );
}
```

## Composition Hierarchy

```
Page (data fetching, orchestration)
└── Layout (shell, nav)
    └── Feature components (UI logic)
        └── UI primitives (shadcn/ui)
```

- Pages own data fetching and top-level state
- Feature components receive data via props, report changes via callbacks
- UI primitives are stateless and reusable

## Memoization

Memoize when there's a measurable cost. Don't memoize everything.

```typescript
// DO: Memoize expensive derived data
const grouped = useMemo(() => groupMessagesByDate(messages), [messages]);

// DO: Stabilize callbacks passed to children
const handleSelect = useCallback((id: string) => {
  setSelectedId(id);
}, []);

// DON'T: Inline functions that create new references every render
// Bad:  <ChildComponent onAction={() => doSomething()} />
// Good: <ChildComponent onAction={handleAction} />
```

Use `React.memo` for components that receive stable props but sit inside frequently re-rendering parents.

## Code Splitting

Lazy-load pages to keep the initial bundle small:

```typescript
import { lazy, Suspense } from "react";

const CalendarPage = lazy(() => import("./pages/CalendarPage"));
const MessagesPage = lazy(() => import("./pages/MessagesPage"));

// In router:
<Suspense fallback={<LoadingSpinner />}>
  <Route path="/calendar" element={<CalendarPage />} />
</Suspense>
```

## Extracting Logic

When a component grows beyond 300 lines, extract:

1. **Custom hooks** for stateful logic (data fetching, subscriptions, form state)
2. **Sub-components** for self-contained UI sections
3. **Utility functions** for pure computation (move to `utils/`)

Keep helper functions outside the component body to avoid recreation on every render:

```typescript
// GOOD: Defined outside component
function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase();
}

export function PlayerAvatar({ name }: { name: string }) {
  return <Avatar>{getInitials(name)}</Avatar>;
}
```
