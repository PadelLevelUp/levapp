import clsx from "clsx";
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Button({ className, variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "destructive" | "ghost" }) {
  return (
    <button
      className={clsx(
        "inline-flex h-11 md:h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90",
        variant === "secondary" && "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        variant === "destructive" && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        variant === "ghost" && "hover:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx("h-11 md:h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring", className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={clsx("h-11 md:h-9 rounded-md border border-input bg-card px-2 text-sm outline-none focus:ring-2 focus:ring-ring", className)} {...props} />;
}

export function Card({ children, className, ...rest }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <section className={clsx("rounded-lg border bg-card p-4 shadow-sm md:p-5", className)} {...rest}>
      {children}
    </section>
  );
}

export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "success" | "warning" | "destructive" | "primary" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "success" && "bg-success text-success-foreground",
        tone === "warning" && "bg-warning text-warning-foreground",
        tone === "destructive" && "bg-destructive text-destructive-foreground",
        tone === "primary" && "bg-secondary text-secondary-foreground",
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({ title, lead }: { title: string; lead?: string }) {
  return (
    <header className="mb-6">
      <h1 className="font-display text-2xl font-semibold">{title}</h1>
      {lead ? <p className="mt-1 text-sm text-muted-foreground">{lead}</p> : null}
    </header>
  );
}
