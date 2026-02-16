import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardMessagesOverviewBlock } from "@/types";
import { useNavigate } from "react-router-dom";

export function MessagesOverviewBlock({
  block,
}: {
  block: DashboardMessagesOverviewBlock;
}) {
  const navigate = useNavigate();
  const go = () => navigate(block.data.href);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card
        role="button"
        tabIndex={0}
        onClick={go}
        onKeyDown={(e) => e.key === "Enter" && go()}
        className="cursor-pointer hover:bg-muted/50 transition-colors"
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Unread messages
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{block.data.unreadMessages}</div>
          <p className="text-xs text-muted-foreground mt-1">
            Messages waiting for reply
          </p>
        </CardContent>
      </Card>

      <Card
        role="button"
        tabIndex={0}
        onClick={go}
        onKeyDown={(e) => e.key === "Enter" && go()}
        className="hidden md:block cursor-pointer hover:bg-muted/50 transition-colors"
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Latest message
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-medium truncate">
            {block.data.latest?.sender ?? ""}
          </p>
          <p className="text-sm text-muted-foreground truncate mt-1">
            {block.data.latest?.preview ?? ""}
          </p>
        </CardContent>
      </Card>

      <Card
        role="button"
        tabIndex={0}
        onClick={go}
        onKeyDown={(e) => e.key === "Enter" && go()}
        className="hidden md:block cursor-pointer hover:bg-muted/50 transition-colors"
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Conversations to reply
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {block.data.conversationsToReply}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            With unread messages
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
