# TypeScript

## Strict Configuration

Enable strict mode in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

## Type Organization

- **Shared types** go in `types/index.ts` (or split by domain: `types/players.ts`, `types/calendar.ts`)
- **Component-specific types** are co-located with the component
- Use `type` for data shapes, `interface` for component props (be consistent)
- Use `import type { ... }` for type-only imports

## Never Use `any`

```typescript
// BAD
export async function addPlayer(data: any): Promise<any> { ... }

// GOOD
export async function addPlayer(data: CreatePlayerInput): Promise<Player> { ... }
```

If you genuinely don't know the shape, use `unknown` and narrow:

```typescript
function handleEvent(data: unknown) {
  if (typeof data === "object" && data !== null && "type" in data) {
    // now TypeScript knows data has a `type` property
  }
}
```

## Discriminated Unions

Use for state machines and mode switching:

```typescript
type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: string };

type EditMode =
  | { type: "viewing" }
  | { type: "editing"; draft: Draft }
  | { type: "confirming-delete" };
```

## Assertions

Prefer narrowing over assertions:

```typescript
// BAD: Type assertion
const user = data as User;

// GOOD: Runtime check
if (isUser(data)) {
  // data is now typed as User
}

// OK: `as const` for literals
const STATUS = { ACTIVE: "active", INACTIVE: "inactive" } as const;
```

## API Types

Always define request and response types for API modules:

```typescript
// types/players.ts
export type Player = {
  id: string;
  name: string;
  email: string;
  level: CoachLevel;
  createdAt: string;
};

export type CreatePlayerInput = {
  name: string;
  email?: string;
  levelId?: number;
};

export type PaginatedResponse<T> = {
  items: T[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
};
```
