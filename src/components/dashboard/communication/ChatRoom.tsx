import { useState, useRef, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useBatchMessages } from "@/hooks/useBatchMessages";
import { useAuth } from "@/hooks/useAuth";
import { MessageBubble } from "./MessageBubble";
import { GIFPickerButton } from "./GIFPickerButton";

const MAX_MESSAGE_LENGTH = 2000;

interface ChatRoomProps {
  batchId: string;
  batchName: string;
}

export function ChatRoom({ batchId, batchName }: ChatRoomProps) {
  const { user } = useAuth();
  const { messages, isLoading, isConnected, sendMessage, retryMessage } =
    useBatchMessages(batchId);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const isOverLimit = input.length > MAX_MESSAGE_LENGTH;
  const isEmptyOrWhitespace = !input.trim();
  const isSendDisabled = isEmptyOrWhitespace || isOverLimit || isSending;

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const content = input.trim();
    if (!content || isSending || isOverLimit) return;

    setInput("");
    setIsSending(true);

    const success = await sendMessage(content, "text");
    if (!success) {
      toast.error("Failed to send message. Tap the message to retry.");
    }

    setIsSending(false);
  }

  async function handleSendGif(gifUrl: string) {
    if (isSending) return;

    setIsSending(true);

    const success = await sendMessage("", "gif", gifUrl);
    if (!success) {
      toast.error("Failed to send GIF. Tap the message to retry.");
    }

    setIsSending(false);
  }

  async function handleRetry(optimisticId: string) {
    const success = await retryMessage(optimisticId);
    if (!success) {
      toast.error("Retry failed. Please try again.");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-semibold text-sm truncate">{batchName}</h2>
        <div className="flex items-center gap-1.5">
          <div
            className={`h-2 w-2 rounded-full ${
              isConnected ? "bg-green-500" : "bg-yellow-500"
            }`}
          />
          <span className="text-xs text-muted-foreground">
            {isConnected ? "Connected" : "Reconnecting..."}
          </span>
        </div>
      </div>

      {/* Messages area */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5"
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No messages yet. Start the conversation!
          </div>
        ) : (
          messages.map((message, index) => {
            const isOwn = message.sender_id === user?.id;
            const prevMessage = index > 0 ? messages[index - 1] : null;
            const showSenderName =
              !prevMessage || prevMessage.sender_id !== message.sender_id;

            return (
              <MessageBubble
                key={message._optimisticId || message.id}
                message={message}
                isOwn={isOwn}
                showSenderName={showSenderName}
                onRetry={handleRetry}
              />
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t px-4 py-3">
        {/* Character count warning */}
        {input.length > 0 && (
          <div className="flex justify-end mb-1">
            <span
              className={`text-xs ${
                isOverLimit
                  ? "text-destructive font-medium"
                  : input.length > MAX_MESSAGE_LENGTH * 0.9
                    ? "text-yellow-600"
                    : "text-muted-foreground"
              }`}
            >
              {input.length}/{MAX_MESSAGE_LENGTH}
            </span>
          </div>
        )}
        <div className="flex items-end gap-2">
          <GIFPickerButton onSelectGif={handleSendGif} disabled={isSending} />
          <textarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            maxLength={MAX_MESSAGE_LENGTH + 100} // Allow slight overflow to show warning
            className={`flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 max-h-32 ${
              isOverLimit ? "border-destructive focus:ring-destructive/20" : ""
            }`}
            style={{ minHeight: "38px" }}
          />
          <button
            onClick={handleSend}
            disabled={isSendDisabled}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-2 text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
