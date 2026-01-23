import { cn } from "@/lib/utils";

interface LoadingSkeletonProps {
  className?: string;
  variant?: "default" | "shimmer" | "pulse" | "wave";
}

export function LoadingSkeleton({ className, variant = "shimmer" }: LoadingSkeletonProps) {
  const baseClasses = "rounded-md bg-muted";
  
  const variantClasses = {
    default: "animate-pulse",
    shimmer: "relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent",
    pulse: "animate-pulse",
    wave: "relative overflow-hidden before:absolute before:inset-0 before:animate-[wave_1.5s_ease-in-out_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent",
  };

  return (
    <div className={cn(baseClasses, variantClasses[variant], className)} />
  );
}

export function LoadingCard() {
  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <LoadingSkeleton className="h-4 w-24" />
        <LoadingSkeleton className="h-4 w-4 rounded-full" />
      </div>
      <LoadingSkeleton className="h-8 w-20" />
      <div className="space-y-2">
        <LoadingSkeleton className="h-3 w-full" />
        <LoadingSkeleton className="h-3 w-3/4" />
      </div>
    </div>
  );
}

export function LoadingClassItem() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
      <LoadingSkeleton className="w-1 h-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <LoadingSkeleton className="h-4 w-32" />
        <LoadingSkeleton className="h-3 w-24" />
      </div>
      <LoadingSkeleton className="h-4 w-10" />
    </div>
  );
}

export function LoadingDashboard() {
  return (
    <div className="p-6 space-y-6 animate-fade-in">
      <LoadingSkeleton className="h-8 w-32" />
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <LoadingCard key={i} />
        ))}
      </div>
      
      <div className="rounded-lg border bg-card">
        <div className="p-6 space-y-4">
          <LoadingSkeleton className="h-6 w-40" />
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <LoadingClassItem key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
