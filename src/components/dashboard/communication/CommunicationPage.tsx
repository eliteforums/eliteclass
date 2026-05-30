import { useState, useEffect } from "react";
import { MessageSquare, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { getUserBatches, type ChatBatch } from "@/services/message.service";
import { BatchList } from "./BatchList";
import { ChatRoom } from "./ChatRoom";
import { DirectMessageList } from "./DirectMessageList";
import { DirectMessageRoom } from "./DirectMessageRoom";
import { BatchMemberList } from "./BatchMemberList";
import type { DMConversation } from "@/services/dm.service";

type DMView = "conversations" | "members";

export function CommunicationPage() {
  const { user, role, instituteId } = useAuth();
  const [batches, setBatches] = useState<ChatBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // DM state
  const [selectedConversation, setSelectedConversation] = useState<DMConversation | null>(null);
  const [dmView, setDmView] = useState<DMView>("conversations");

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

  function handleSelectConversation(conversation: DMConversation) {
    setSelectedConversation(conversation);
  }

  function handleStartConversation(conversation: DMConversation) {
    setSelectedConversation(conversation);
    setDmView("conversations");
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] border rounded-lg overflow-hidden bg-background">
      <Tabs defaultValue="batch-chat" className="flex w-full">
        {/* Left panel with tabs */}
        <div className="w-[280px] border-r flex flex-col shrink-0">
          <div className="px-3 py-2 border-b">
            <TabsList className="w-full grid grid-cols-2 h-9">
              <TabsTrigger value="batch-chat" className="text-xs">
                <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                Batch Chat
              </TabsTrigger>
              <TabsTrigger value="direct-messages" className="text-xs">
                <Users className="h-3.5 w-3.5 mr-1.5" />
                Direct Messages
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Batch Chat list */}
          <TabsContent value="batch-chat" className="flex-1 overflow-y-auto m-0">
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
          </TabsContent>

          {/* DM list */}
          <TabsContent value="direct-messages" className="flex-1 overflow-y-auto m-0">
            <div className="flex flex-col h-full">
              {/* Sub-navigation for DMs */}
              <div className="flex border-b">
                <button
                  onClick={() => setDmView("conversations")}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    dmView === "conversations"
                      ? "text-primary border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Conversations
                </button>
                <button
                  onClick={() => setDmView("members")}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    dmView === "members"
                      ? "text-primary border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Members
                </button>
              </div>

              {/* DM content */}
              <div className="flex-1 overflow-y-auto">
                {dmView === "conversations" ? (
                  <DirectMessageList
                    selectedConversationId={selectedConversation?.id ?? null}
                    onSelectConversation={handleSelectConversation}
                  />
                ) : (
                  <BatchMemberList onStartConversation={handleStartConversation} />
                )}
              </div>
            </div>
          </TabsContent>
        </div>

        {/* Chat room panel */}
        <div className="flex-1 flex flex-col min-w-0">
          <TabsContent value="batch-chat" className="flex-1 m-0 flex flex-col min-h-0">
            {selectedBatch ? (
              <ChatRoom batchId={selectedBatch.id} batchName={selectedBatch.name} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <MessageSquare className="h-10 w-10 opacity-40" />
                <p className="text-sm">Select a batch to start chatting</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="direct-messages" className="flex-1 m-0 flex flex-col min-h-0">
            {selectedConversation ? (
              <DirectMessageRoom
                conversationId={selectedConversation.id}
                recipientName={selectedConversation.other_participant?.name ?? "Unknown"}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <Users className="h-10 w-10 opacity-40" />
                <p className="text-sm">Select a conversation or start a new one</p>
              </div>
            )}
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
