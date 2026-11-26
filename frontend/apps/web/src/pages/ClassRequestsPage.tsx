import { AppLayout } from "@/components/layout/AppLayout";
import { CoachRequestsTable } from "@/components/class-requests/CoachRequestsTable";

/** PAD-104 / PAD-795: the coach's table of class requests (classes.coach-requests-table). */
export default function ClassRequestsPage() {
  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-7xl">
        <CoachRequestsTable />
      </div>
    </AppLayout>
  );
}
