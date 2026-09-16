import { AppLayout } from "@/components/layout/AppLayout";
import { ClassRequestsSection } from "@/components/class-requests/ClassRequestsSection";

/** PAD-104: the coach's inbox of class requests (classes.class-requests). */
export default function ClassRequestsPage() {
  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-3xl">
        <ClassRequestsSection role="coach" />
      </div>
    </AppLayout>
  );
}
