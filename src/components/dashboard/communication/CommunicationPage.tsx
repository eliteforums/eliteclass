import { useState, useEffect } from "react";
import { MessageSquare } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getUserBatches, type ChatBatch } from "@/services/message.service";
import { BatchList } from "./BatchList";
import { ChatRoom } from "./ChatRoom";

export function CommunicationPage() {
  const { user, role, instituteId } = useAuth();
  const [batches, setBatches] = useState<ChatBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchBatches() {
      if (!user?.id || !role || !instituteId) return;

      setIsLoading(true);
      const result = await getUserBatches(user.id, role, instituteId);
      if (result.success && result.data) {
        setBatches(result.data);
      }
      setIsLoading(false);
    }

    fetchBatches();
  }, [user?.id, role, instituteId]);

  const selectedBatch = batches.find((b) => b.id === selectedBatchId) ?? null;

  return (
    <div className="flex h-[calc(100vh-4rem)] border rounded-lg overflow-hidden bg-background">
      {/* Batch list panel */}
      <div className="w-[280px] border-r flex flex-col shrink-0">
        <div className="px-4 py-3 border-b">
          <h1 className="font-semibold text-sm">Messages</h1>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <BatchList
              batches={batches}
              selectedBatchId={selectedBatchId}
              onSelectBatch={setSelectedBatchId}
            />
          )}
        </div>
      </div>

      {/* Chat room panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedBatch ? (
          <ChatRoom batchId={selectedBatch.id} batchName={selectedBatch.name} />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <MessageSquare className="h-10 w-10 opacity-40" />
            <p className="text-sm">Select a batch to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
}
