import { AlertCircle, Loader2 } from "lucide-react";
import type { ChatMessage } from "@/services/message.service";
import type { MessageStatus } from "@/hooks/useBatchMessages";

interface MessageBubbleProps {
  message: ChatMessage & { status?: MessageStatus; _optimisticId?: string };
  isOwn: boolean;
  showSenderName: boolean;
  onRetry?: (optimisticId: string) => void;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MessageBubble({ message, isOwn, showSenderName, onRetry }: MessageBubbleProps) {
  const isGif = message.message_type === "gif" && message.gif_url;
  const status = (message as { status?: MessageStatus }).status;
  const optimisticId = (message as { _optimisticId?: string })._optimisticId;
  const isFailed = status === "failed";
  const isSending = status === "sending";

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
            ? isFailed
              ? "bg-destructive/80 text-destructive-foreground"
              : "bg-primary text-primary-foreground"
            : "bg-muted text-foreground"
        } ${isSending ? "opacity-70" : ""}`}
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
              isOwn
                ? isFailed
                  ? "text-destructive-foreground/70"
                  : "text-primary-foreground/70"
                : "text-muted-foreground"
            }`}
          >
            {formatTime(message.created_at)}
          </span>
          {isSending && isOwn && (
            <Loader2 className="h-3 w-3 animate-spin text-primary-foreground/70" />
          )}
        </div>
      </div>

      {/* Retry indicator for failed messages */}
      {isFailed && isOwn && optimisticId && (
        <button
          onClick={() => onRetry?.(optimisticId)}
          className="flex items-center gap-1 mt-0.5 text-xs text-destructive hover:text-destructive/80 transition-colors"
          aria-label="Tap to retry sending message"
        >
          <AlertCircle className="h-3 w-3" />
          <span>Failed to send. Tap to retry</span>
        </button>
      )}
    </div>
  );
}
