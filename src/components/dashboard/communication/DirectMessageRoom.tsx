// ---------------------------------------------------------------------------
// DirectMessageRoom — 1:1 chat view with WhatsApp-style message bubbles
//
// Features:
//   - Left-aligned received bubbles, right-aligned sent bubbles
//   - Sender names grouped for consecutive messages from same sender
//   - HH:MM timestamps on each bubble
//   - Emoji and GIF picker support (reuses EmojiPickerButton & GIFPickerButton)
//   - 2000 character limit with send disabled when exceeded
//   - Optimistic updates with retry via useDirectMessages hook
//   - Error display when recipient has no common batch
// ---------------------------------------------------------------------------

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, AlertCircle, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { useDirectMessages, type LocalDMMessage } from "@/hooks/useDirectMessages";
import { useAuth } from "@/hooks/useAuth";
import { EmojiPickerButton } from "./EmojiPickerButton";
import { GIFPickerButton } from "./GIFPickerButton";

const MAX_MESSAGE_LENGTH = 2000;

interface DirectMessageRoomProps {
  conversationId: string;
  recipientName: string;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function DMBubble({
  message,
  isOwn,
  showSenderName,
  onRetry,
}: {
  message: LocalDMMessage;
  isOwn: boolean;
  showSenderName: boolean;
  onRetry?: () => void;
}) {
  const isGif = message.message_type === "gif" && message.gif_url;
  const isFailed = message.status === "failed";
  const isSending = message.status === "sending";

  return (
    <div className={`flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
      {showSenderName && !isOwn && (
        <span className="text-xs font-medium text-muted-foreground ml-1 mb-0.5">
          {message.sender_name}
        </span>
      )}
      <div
        className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
          isOwn
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        } ${isFailed ? "opacity-70 border border-destructive/40" : ""} ${isSending ? "opacity-70" : ""}`}
      >
        {isGif ? (
          <div className="overflow-hidden rounded-md">
            <img
              src={message.gif_url!}
              alt={message.content || "GIF"}
              className="max-w-full h-auto rounded-md"
              style={{ maxHeight: "200px" }}
              loading="lazy"
            />
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        )}
        <div className="flex items-center gap-1 mt-1">
          <span
            className={`text-[10px] ${
              isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
            }`}
          >
            {formatTime(message.created_at)}
          </span>
          {isSending && (
            <Loader2 className="h-3 w-3 animate-spin text-primary-foreground/50" />
          )}
          {isFailed && onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center gap-0.5 text-[10px] text-destructive hover:text-destructive/80"
              title="Tap to retry"
            >
              <RotateCw className="h-3 w-3" />
              <span>Retry</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function DirectMessageRoom({
  conversationId,
  recipientName,
}: DirectMessageRoomProps) {
  const { user } = useAuth();
  const { messages, isLoading, isConnected, sendMessage, retryMessage, markAsRead } =
    useDirectMessages(conversationId);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isOverLimit = input.length > MAX_MESSAGE_LENGTH;
  const canSend = input.trim().length > 0 && !isOverLimit && !isSending;

  // Mark conversation as read when opened
  useEffect(() => {
    markAsRead();
  }, [conversationId, markAsRead]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const content = input.trim();
    if (!content || isSending || isOverLimit) return;

    setInput("");
    setIsSending(true);
    setSendError(null);

    const success = await sendMessage(content, "text");
    if (!success) {
      // Check if the failed message has "no common batch" error
      toast.error("Failed to send message. Tap to retry.");
    }

    setIsSending(false);
  }

  async function handleSendGif(gifUrl: string) {
    if (isSending) return;

    setIsSending(true);
    setSendError(null);

    const success = await sendMessage("", "gif", gifUrl);
    if (!success) {
      toast.error("Failed to send GIF. Please try again.");
    }

    setIsSending(false);
  }

  async function handleRetry(tempId: string) {
    setSendError(null);
    const success = await retryMessage(tempId);
    if (!success) {
      setSendError("Message delivery failed. The recipient may not be reachable.");
    }
  }

  function handleEmojiSelect(emoji: string) {
    setInput((prev) => prev + emoji);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Check if any message failed due to common batch restriction
  const hasCommonBatchError = sendError?.includes("not reachable");

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="font-semibold text-sm truncate">{recipientName}</h2>
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

      {/* Error banner for common batch restriction */}
      {hasCommonBatchError && (
        <div className="flex items-center gap-2 bg-destructive/10 border-b border-destructive/20 px-4 py-2">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-xs text-destructive">
            Cannot send messages: recipient is not reachable (no common batch).
          </p>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
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
              <DMBubble
                key={message.id}
                message={message}
                isOwn={isOwn}
                showSenderName={showSenderName}
                onRetry={
                  message.status === "failed" && message._tempId
                    ? () => handleRetry(message._tempId!)
                    : undefined
                }
              />
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t px-4 py-3">
        {isOverLimit && (
          <p className="text-xs text-destructive mb-1.5">
            Message exceeds {MAX_MESSAGE_LENGTH} character limit (
            {input.length}/{MAX_MESSAGE_LENGTH})
          </p>
        )}
        <div className="flex items-end gap-2">
          <EmojiPickerButton onEmojiSelect={handleEmojiSelect} />
          <GIFPickerButton onSelectGif={handleSendGif} disabled={isSending} />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 max-h-32"
            style={{ minHeight: "38px" }}
          />
          <button
            onClick={handleSend}
            disabled={!canSend}
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
