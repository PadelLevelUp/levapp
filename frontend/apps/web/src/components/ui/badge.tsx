import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  // Chips take the 6px radius. Full pills are for filter controls, not for
  // status chips — the radius is how you tell them apart at a glance.
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold tabular-nums transition-colors focus:outline-none focus:ring-[3px] focus:ring-ring/40",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:brightness-95",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:brightness-95",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:brightness-95",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
