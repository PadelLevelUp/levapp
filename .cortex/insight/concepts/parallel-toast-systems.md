The web app maintains two independent toast-notification implementations side by side: a Radix-based stack (`toast.tsx` + `toaster.tsx` + `use-toast.ts`) and a `sonner`-based one (`sonner.tsx`), each re-mapping its own class names onto the same design tokens. Neither file references the other — the duplication is only visible by reading both — and a caller must commit to one system rather than mixing them.

## Implemented by
`frontend/apps/web/src/components/ui/sonner.tsx`
`frontend/apps/web/src/components/ui/toast.tsx`
`frontend/apps/web/src/components/ui/toaster.tsx`
`frontend/apps/web/src/components/ui/use-toast.ts`

## Related concepts
[[levapp-visual-design-conventions]]
