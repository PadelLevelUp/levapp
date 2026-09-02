# Data Fetching & API

## Axios Client Setup

Create one instance with interceptors for auth and error handling:

```typescript
// api/client.ts
import axios from "axios";

const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("accessToken");
      window.location.href = "/auth";
    }
    return Promise.reject(err);
  }
);

export default api;
```

## API Module Pattern

One file per feature. Export typed async functions. **Never use `any`.**

```typescript
// api/players.ts
import api from "./client";
import type { Player, CreatePlayerInput } from "@/types";

export async function getPlayers(): Promise<Player[]> {
  const res = await api.get("/players");
  return res.data;
}

export async function createPlayer(input: CreatePlayerInput): Promise<Player> {
  const res = await api.post("/players", input);
  return res.data;
}
```

## Request Cancellation

Use `AbortController` in every data-fetching effect:

```typescript
useEffect(() => {
  const controller = new AbortController();

  async function load() {
    setLoading(true);
    try {
      const data = await getPlayers({ signal: controller.signal });
      setPlayers(data);
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  load();
  return () => controller.abort();
}, [dependency]);
```

## Loading, Error, and Empty States

Every data-fetching component must handle all three:

```typescript
if (loading) return <Skeleton />;
if (error) return <ErrorMessage message={error} onRetry={refetch} />;
if (items.length === 0) return <EmptyState />;
return <ItemList items={items} />;
```

## Optimistic Updates with Rollback

```typescript
const previous = items;
setItems((prev) => [...prev, optimisticItem]);

try {
  const created = await createItem(data);
  setItems((prev) =>
    prev.map((i) => (i.id === optimisticItem.id ? created : i))
  );
} catch {
  setItems(previous); // Rollback
  toast({ variant: "destructive", title: "Failed to create item" });
}
```

## SSE (Server-Sent Events)

Extract SSE logic into a reusable hook. **Never pass auth tokens in query strings.**

```typescript
function useEventSource(
  url: string,
  handlers: Record<string, (data: unknown) => void>
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const es = new EventSource(url);

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handlersRef.current[data.type]?.(data);
    };

    es.onerror = () => es.close();
    return () => es.close();
  }, [url]);
}
```

## Caching

For manual caching, use TTL-based patterns with explicit invalidation:

```typescript
let cache: { data: Player[]; timestamp: number } | null = null;
const TTL_MS = 60_000;

export async function getPlayersCached(): Promise<Player[]> {
  if (cache && Date.now() - cache.timestamp < TTL_MS) return cache.data;
  const data = await getPlayers();
  cache = { data, timestamp: Date.now() };
  return data;
}

export function invalidatePlayersCache() {
  cache = null;
}
```

Call invalidation functions after mutations (create, update, delete).
