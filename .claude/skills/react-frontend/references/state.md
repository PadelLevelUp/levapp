# State Management

## Choose the Right Layer

| Scope | Tool | Example |
|-------|------|---------|
| Single component | `useState` | Form input, toggle |
| Shared across subtree | Lift state to parent, pass as props | Filter applied to list |
| App-wide, low-frequency | React Context | Auth, theme, layout |
| App-wide, high-frequency | Dedicated state module or Zustand | Unread counts, SSE data |
| Server data | React Query / custom cache | API responses |

## Never Store Derived State

Compute it instead:

```typescript
// BAD: Storing a filtered copy
const [filtered, setFiltered] = useState(items.filter(predicate));

// GOOD: Derive it
const filtered = useMemo(() => items.filter(predicate), [items, predicate]);
```

## Combine Related State

If multiple pieces of state always change together, use a single object or a reducer:

```typescript
// BAD: Multiple booleans for a single modal
const [isEditing, setIsEditing] = useState(false);
const [draft, setDraft] = useState<Draft | null>(null);
const [deleteOpen, setDeleteOpen] = useState(false);

// GOOD: Union state (discriminated union)
type Mode =
  | { type: "viewing" }
  | { type: "editing"; draft: Draft }
  | { type: "confirming-delete" };

const [mode, setMode] = useState<Mode>({ type: "viewing" });
```

## Context Providers

Keep Context lean. Only put truly global, rarely-changing data in context.

```typescript
type AuthContextType = {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  login: (token: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

High-frequency updates (unread counts, real-time data) should NOT live in Context — they'll re-render every consumer. Use a dedicated state module, Zustand store, or subscription pattern instead.
