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

export function LoadingClassList() {
  return (
    <div className="rounded-lg border bg-card">
      <div className="p-6 space-y-4">
        <LoadingSkeleton className="h-6 w-40" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <LoadingClassItem key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function LoadingCalendar() {
  return (
    <div className="flex flex-col h-full animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <LoadingSkeleton className="h-9 w-9 rounded-md" />
          <LoadingSkeleton className="h-9 w-9 rounded-md" />
          <LoadingSkeleton className="h-9 w-20 rounded-md" />
        </div>
        <LoadingSkeleton className="h-6 w-48" />
        <LoadingSkeleton className="h-9 w-32 rounded-md" />
      </div>
      
      {/* Header */}
      <div className="grid grid-cols-8 border-b border-border">
        <div className="p-2" />
        {[...Array(7)].map((_, i) => (
          <div key={i} className="p-3 text-center border-l border-border">
            <LoadingSkeleton className="h-4 w-8 mx-auto mb-1" />
            <LoadingSkeleton className="h-8 w-8 mx-auto rounded-full" />
          </div>
        ))}
      </div>
      
      {/* Grid */}
      <div className="flex-1 grid grid-cols-8 overflow-auto">
        <div className="border-r border-border">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="h-16 p-2 border-b border-border">
              <LoadingSkeleton className="h-3 w-10" />
            </div>
          ))}
        </div>
        {[...Array(7)].map((_, col) => (
          <div key={col} className="border-r border-border">
            {[...Array(12)].map((_, row) => (
              <div key={row} className="h-16 p-1 border-b border-border">
                {(col === 1 && row === 2) || (col === 3 && row === 5) || (col === 5 && row === 3) ? (
                  <LoadingSkeleton className="h-12 w-full rounded-md" />
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function LoadingConversationList() {
  return (
    <div className="w-full md:w-80 border-r border-border bg-card flex flex-col">
      <div className="p-4 border-b border-border">
        <LoadingSkeleton className="h-10 w-full rounded-md" />
      </div>
      <div className="flex-1 p-2 space-y-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-lg">
            <LoadingSkeleton className="w-10 h-10 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <LoadingSkeleton className="h-4 w-24" />
                <LoadingSkeleton className="h-3 w-10" />
              </div>
              <LoadingSkeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LoadingChatThread() {
  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center gap-3">
        <LoadingSkeleton className="w-10 h-10 rounded-full" />
        <LoadingSkeleton className="h-5 w-32" />
      </div>
      
      {/* Messages */}
      <div className="flex-1 p-4 space-y-4">
        <div className="flex justify-start">
          <LoadingSkeleton className="h-16 w-64 rounded-2xl rounded-bl-md" />
        </div>
        <div className="flex justify-end">
          <LoadingSkeleton className="h-12 w-48 rounded-2xl rounded-br-md" />
        </div>
        <div className="flex justify-start">
          <LoadingSkeleton className="h-20 w-72 rounded-2xl rounded-bl-md" />
        </div>
        <div className="flex justify-end">
          <LoadingSkeleton className="h-10 w-36 rounded-2xl rounded-br-md" />
        </div>
        <div className="flex justify-start">
          <LoadingSkeleton className="h-14 w-56 rounded-2xl rounded-bl-md" />
        </div>
      </div>
      
      {/* Input */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-2">
          <LoadingSkeleton className="h-10 flex-1 rounded-md" />
          <LoadingSkeleton className="h-10 w-10 rounded-md" />
        </div>
      </div>
    </div>
  );
}

export function LoadingMessages() {
  return (
    // The real page shows ONE pane on mobile and two side by side on desktop.
    // The skeleton rendered both unconditionally, so the fixed-width list plus
    // the thread pane overflowed a 390px viewport by 159px — clipped by an
    // ancestor, which is why it never showed up as document overflow.
    <div className="flex h-full animate-fade-in">
      <LoadingConversationList />
      <div className="hidden md:flex flex-1">
        <LoadingChatThread />
      </div>
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
      
      <LoadingClassList />
    </div>
  );
}

export function LoadingPlayerCard() {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <LoadingSkeleton className="w-12 h-12 rounded-full" />

        <div className="flex-1 space-y-2">
          <LoadingSkeleton className="h-4 w-32" />
          <LoadingSkeleton className="h-3 w-40" />
        </div>
      </div>

      {/* Badges */}
      <div className="flex gap-2 flex-wrap">
        <LoadingSkeleton className="h-5 w-14 rounded-md" />
        <LoadingSkeleton className="h-5 w-16 rounded-md" />
      </div>
    </div>
  );
}

export function LoadingPlayersGrid({
  count = 6,
}: {
  count?: number;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
      {[...Array(count)].map((_, i) => (
        <LoadingPlayerCard key={i} />
      ))}
    </div>
  );
}