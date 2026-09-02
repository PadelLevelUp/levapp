# Error Handling

## Toast Notifications

Use toasts for non-blocking user feedback:

```typescript
import { useToast } from "@/hooks/use-toast";

const { toast } = useToast();

try {
  await saveData();
  toast({ title: "Saved successfully" });
} catch (err) {
  toast({
    variant: "destructive",
    title: "Save failed",
    description: err instanceof Error ? err.message : "Unknown error",
  });
}
```

Always show both success AND failure toasts for user-initiated actions.

## Error Boundaries

Wrap major page sections to prevent full-app crashes:

```typescript
import { ErrorBoundary } from "react-error-boundary";

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="p-6 text-center">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-muted-foreground mt-2">{error.message}</p>
      <Button onClick={resetErrorBoundary} className="mt-4">Try again</Button>
    </div>
  );
}

// Wrap each major section
<ErrorBoundary FallbackComponent={ErrorFallback}>
  <CalendarPage />
</ErrorBoundary>
```

## Rules

1. **Never swallow errors.** No empty `catch {}` or `catch(() => {})` blocks.
2. **Never use `console.error` as the only error handling.** Always inform the user.
3. **Preserve error objects.** Don't reduce to just `err.message` — keep the stack for debugging.
4. **Handle promise rejections** in every `async` function — don't fire-and-forget with `void asyncCall()`.
5. **Distinguish user errors from system errors.** Validation issues get inline messages; network/server errors get toasts.

## Async Pattern

```typescript
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

const handleAction = async () => {
  setLoading(true);
  setError(null);
  try {
    await performAction();
    toast({ title: "Done" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong";
    setError(message);
    toast({ variant: "destructive", title: "Failed", description: message });
  } finally {
    setLoading(false);
  }
};
```
