# Forms

## Pattern: Controlled Components + Zod

```typescript
import { z } from "zod";

const schema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
});

type FormData = z.infer<typeof schema>;

function MyForm({ onSubmit }: { onSubmit: (data: FormData) => void }) {
  const [form, setForm] = useState<FormData>({ name: "", email: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const result = schema.safeParse(form);
    if (!result.success) {
      const fieldErrors: typeof errors = {};
      result.error.errors.forEach((e) => {
        fieldErrors[e.path[0] as keyof FormData] = e.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await onSubmit(result.data);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      <div>
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        {errors.name && <p className="text-sm text-destructive mt-1">{errors.name}</p>}
      </div>

      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        />
        {errors.email && <p className="text-sm text-destructive mt-1">{errors.email}</p>}
      </div>

      <Button type="submit" disabled={submitting}>
        {submitting ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}
```

## Rules

- Always validate with Zod before submitting
- Show field-level error messages below inputs
- Disable submit button while submitting (prevent double-submit)
- Every `<Input>` must have an associated `<Label>` with matching `htmlFor`/`id`
- Use `<form onSubmit>` with `e.preventDefault()`, not `<Button onClick>`
- Debounce search inputs (300ms) to avoid excessive re-filtering

## Cross-Field Validation

Use Zod's `.refine()` for validation that depends on multiple fields:

```typescript
const schema = z
  .object({
    password: z.string().min(6),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });
```
