import { AppLayout } from '@/components/layout/AppLayout';
import { LoadingCalendar } from '@/components/ui/loading-skeleton';
import { Sparkles } from 'lucide-react';

export default function CalendarLoadingDemo() {
  return (
    <AppLayout>
      <div className="relative h-full">
        <div className="absolute top-4 right-4 z-10">
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground bg-muted/80 px-3 py-1.5 rounded-full border border-border">
            <Sparkles className="w-4 h-4" />
            Calendar Loading Demo
          </span>
        </div>
        <LoadingCalendar />
      </div>
    </AppLayout>
  );
}
