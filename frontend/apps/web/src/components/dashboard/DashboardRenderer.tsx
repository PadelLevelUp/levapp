import type { DashboardBlock } from "@/types";
import { MessagesOverviewBlock } from "./blocks/MessagesOverviewBlock";
import { KpiGridBlock } from "./blocks/KpiGridBlock";
import { ClassListBlock } from "./blocks/ClassListBlock";
import { NotificationActivityBlock } from "./blocks/NotificationActivityBlock";
import { PendingConfirmationsBlock } from "./blocks/PendingConfirmationsBlock";

function renderBlock(block: DashboardBlock): React.ReactNode {
  switch (block.type) {
    case "messages_overview":
      return <MessagesOverviewBlock key={block.id} block={block} />;
    case "kpi_grid":
      return <KpiGridBlock key={block.id} block={block} />;
    case "class_list":
      return <ClassListBlock key={block.id} block={block} />;
    case "notification_activity":
      return <NotificationActivityBlock key={block.id} block={block} />;
    case "pending_confirmations":
      return <PendingConfirmationsBlock key={block.id} block={block} />;
    case "grid": {
      const baseCols = block.data.cols.base;
      const lgCols = block.data.cols.lg;

      const baseColsClass =
      block.data.cols.base === 2 ? "grid-cols-2" : "grid-cols-1";

      const lgColsClass =
      block.data.cols.lg === 2 ? "lg:grid-cols-2" : "lg:grid-cols-1";


      return (
        <div key={block.id} className={`grid ${baseColsClass} ${lgColsClass} gap-4`}>
            {block.data.children.map((child) => renderBlock(child))}
        </div>
        );
    }
    default:
      return null;
  }
}

export function DashboardRenderer({ blocks }: { blocks: DashboardBlock[] }) {
  return <div className="space-y-6">{blocks.map((b) => renderBlock(b))}</div>;
}
