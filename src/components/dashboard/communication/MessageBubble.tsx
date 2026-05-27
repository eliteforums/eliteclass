import type { ChatMessage } from "@/services/message.service";

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  showSenderName: boolean;
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function MessageBubble({ message, isOwn, showSenderName }: MessageBubbleProps) {
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
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        <span
          className={`text-[10px] mt-1 block ${
            isOwn ? "text-primary-foreground/70" : "text-muted-foreground"
          }`}
        >
          {formatTime(message.created_at)}
        </span>
      </div>
    </div>
  );
}
