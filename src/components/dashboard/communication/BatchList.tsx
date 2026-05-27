import { MessageSquare } from "lucide-react";
import type { ChatBatch } from "@/services/message.service";

interface BatchListProps {
  batches: ChatBatch[];
  selectedBatchId: string | null;
  onSelectBatch: (batchId: string) => void;
}

export function BatchList({ batches, selectedBatchId, onSelectBatch }: BatchListProps) {
  if (batches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center text-muted-foreground">
        <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">No batches found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      {batches.map((batch) => (
        <button
          key={batch.id}
          onClick={() => onSelectBatch(batch.id)}
          className={`flex flex-col items-start gap-0.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors w-full ${
            selectedBatchId === batch.id
              ? "bg-primary/10 text-primary border border-primary/20"
              : "hover:bg-muted/50 border border-transparent"
          }`}
        >
          <span className="font-medium truncate w-full">{batch.name}</span>
          {batch.course_name && (
            <span className="text-xs text-muted-foreground truncate w-full">
              {batch.course_name}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
