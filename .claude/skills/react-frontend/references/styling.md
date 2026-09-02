# Styling

## Tailwind CSS

Use Tailwind utility classes for all styling. No inline styles, no CSS modules.

### Conditional Classes

Use the `cn()` helper (clsx + tailwind-merge):

```typescript
import { cn } from "@/lib/utils";

<div className={cn(
  "p-4 rounded-lg border",
  isActive && "bg-primary text-primary-foreground",
  isDisabled && "opacity-50 pointer-events-none"
)} />
```

### Theming

Define colors as CSS custom properties (HSL) in `index.css`:

```css
:root {
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;
  --primary: 222 47% 11%;
  --destructive: 0 84% 60%;
  /* ... */
}

.dark {
  --background: 222 47% 11%;
  --foreground: 210 40% 98%;
  /* ... */
}
```

Reference in Tailwind as `bg-background`, `text-foreground`, `bg-primary`, etc.

### Spacing

Use consistent Tailwind spacing tokens. Avoid magic pixel values:

```typescript
// GOOD
<div className="p-4 gap-2 mb-6" />

// BAD
<div className="p-[13px] gap-[7px] mb-[23px]" />
```

If a custom pixel value is truly needed (e.g., calendar grid), define it as a constant and reference it in one place.

## shadcn/ui

- Import from `@/components/ui/{component}`
- **Never modify** generated shadcn files — customize via Tailwind config or wrapper components
- Use `class-variance-authority` for component variants

```typescript
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
```

## Responsive Design

- Use Tailwind breakpoints: `sm:`, `md:`, `lg:`, `xl:`
- Use a `useIsMobile()` hook for logic that depends on screen size
- Design mobile-first, then add breakpoints for larger screens
