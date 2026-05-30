// ---------------------------------------------------------------------------
// DirectMessageList — Conversation list with unread indicators
//
// Displays DM conversations ordered by most recent activity.
// Shows other participant's name/avatar and last message preview.
// ---------------------------------------------------------------------------

import { useState, useEffect } from "react";
import { MessageSquare, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getConversations, type DMConversation } from "@/services/dm.service";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface DirectMessageListProps {
  selectedConversationId: string | null;
  onSelectConversation: (conversation: DMConversation) => void;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function getLastMessagePreview(conversation: DMConversation): string {
  if (!conversation.last_message) return "No messages yet";
  const msg = conversation.last_message;
  if (msg.message_type === "gif") return "🖼️ GIF";
  return msg.content ?? "";
}

export function DirectMessageList({
  selectedConversationId,
  onSelectConversation,
}: DirectMessageListProps) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchConversations() {
      if (!user?.id) return;

      setIsLoading(true);
      const result = await getConversations(user.id);
      if (result.success && result.data) {
        setConversations(result.data);
      }
      setIsLoading(false);
    }

    fetchConversations();
  }, [user?.id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center text-muted-foreground">
        <MessageSquare className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">No conversations yet</p>
        <p className="text-xs mt-1">Start a conversation from the members list</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 p-2">
      {conversations.map((conversation) => {
        const isSelected = selectedConversationId === conversation.id;
        const otherName = conversation.other_participant?.name ?? "Unknown";
        const avatarUrl = conversation.other_participant?.avatar_url ?? undefined;
        const preview = getLastMessagePreview(conversation);
        const hasUnread = (conversation.unread_count ?? 0) > 0;
        const timeStr = conversation.last_message_at
          ? formatRelativeTime(conversation.last_message_at)
          : "";

        return (
          <button
            key={conversation.id}
            onClick={() => onSelectConversation(conversation)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors w-full ${
              isSelected
                ? "bg-primary/10 text-primary border border-primary/20"
                : "hover:bg-muted/50 border border-transparent"
            }`}
          >
            {/* Avatar */}
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarImage src={avatarUrl} alt={otherName} />
              <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                {getInitials(otherName)}
              </AvatarFallback>
            </Avatar>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={`font-medium truncate ${hasUnread ? "text-foreground" : ""}`}>
                  {otherName}
                </span>
                {timeStr && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {timeStr}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <p className={`text-xs truncate ${hasUnread ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                  {preview}
                </p>
                {hasUnread && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground shrink-0">
                    {conversation.unread_count! > 99
                      ? "99+"
                      : conversation.unread_count}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
