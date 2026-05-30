import { cn } from "@/lib/utils";
import type { Notification } from "@/services/notification.service";

interface NotificationItemProps {
  notification: Notification;
  onRead: (notificationId: string) => void;
}

/**
 * Formats a date string into a relative time label (e.g. "2m ago", "3h ago", "5d ago").
 */
function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) return "just now";

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;

  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

/**
 * NotificationItem — renders a single notification row in the dropdown.
 * Clicking an unread notification marks it as read.
 */
export function NotificationItem({ notification, onRead }: NotificationItemProps) {
  const isUnread = !notification.is_read;

  function handleClick() {
    if (isUnread) {
      onRead(notification.id);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent/50",
        isUnread && "bg-primary/5",
      )}
    >
      {/* Unread indicator dot */}
      <div className="mt-1.5 shrink-0">
        <div
          className={cn(
            "h-2 w-2 rounded-full",
            isUnread ? "bg-primary" : "bg-transparent",
          )}
        />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            "text-sm leading-tight truncate",
            isUnread ? "font-semibold text-foreground" : "font-medium text-foreground/80",
          )}
        >
          {notification.title}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
          {notification.body}
        </p>
        <div className="mt-1 flex items-center gap-2">
          {notification.sender && (
            <span className="text-[10px] text-muted-foreground">
              {notification.sender.name}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground">
            {formatRelativeTime(notification.created_at)}
          </span>
        </div>
      </div>
    </button>
  );
}
