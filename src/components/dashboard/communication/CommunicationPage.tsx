import { useState, useEffect } from "react";
import { MessageSquare, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getUserBatches, type ChatBatch } from "@/services/message.service";
import { BatchList } from "./BatchList";
import { ChatRoom } from "./ChatRoom";
import { DirectMessageList } from "./DirectMessageList";
import { DirectMessageRoom } from "./DirectMessageRoom";
import { BatchMemberList } from "./BatchMemberList";
import type { DMConversation } from "@/services/dm.service";

type ActiveTab = "batch-chat" | "direct-messages";
type DMView = "conversations" | "members";

export function CommunicationPage() {
  const { user, role, instituteId } = useAuth();
  const [batches, setBatches] = useState<ChatBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>("batch-chat");

  // DM state
  const [selectedConversation, setSelectedConversation] =
    useState<DMConversation | null>(null);
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
      {/* Left panel */}
      <div className="w-[280px] border-r flex flex-col shrink-0">
        {/* Tab switcher */}
        <div className="px-3 py-2 border-b">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            <button
              onClick={() => setActiveTab("batch-chat")}
              className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "batch-chat"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Batch Chat
            </button>
            <button
              onClick={() => setActiveTab("direct-messages")}
              className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                activeTab === "direct-messages"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              Direct Messages
            </button>
          </div>
        </div>

        {/* Left panel content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === "batch-chat" && (
            <>
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
            </>
          )}

          {activeTab === "direct-messages" && (
            <div className="flex flex-col h-full">
              {/* Sub-navigation for DMs */}
              <div className="flex border-b shrink-0">
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
                  <BatchMemberList
                    onStartConversation={handleStartConversation}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right panel — Chat room */}
      <div className="flex-1 flex flex-col min-w-0">
        {activeTab === "batch-chat" && (
          <>
            {selectedBatch ? (
              <ChatRoom
                batchId={selectedBatch.id}
                batchName={selectedBatch.name}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <MessageSquare className="h-10 w-10 opacity-40" />
                <p className="text-sm">Select a batch to start chatting</p>
              </div>
            )}
          </>
        )}

        {activeTab === "direct-messages" && (
          <>
            {selectedConversation ? (
              <DirectMessageRoom
                conversationId={selectedConversation.id}
                recipientName={
                  selectedConversation.other_participant?.name ?? "Unknown"
                }
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <Users className="h-10 w-10 opacity-40" />
                <p className="text-sm">
                  Select a conversation or start a new one
                </p>
                <p className="text-xs">
                  Go to the Members tab to message a batch mate
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
