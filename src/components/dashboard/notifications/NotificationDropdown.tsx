import { BellOff, CheckCheck, Loader2 } from "lucide-react";
import { NotificationItem } from "./NotificationItem";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Notification } from "@/services/notification.service";

interface NotificationDropdownProps {
  notifications: Notification[];
  isLoading: boolean;
  onMarkAsRead: (notificationId: string) => void;
  onMarkAllAsRead: () => void;
  unreadCount: number;
}

/**
 * NotificationDropdown — displays the 20 most recent notifications.
 * Shows empty state when no notifications exist, and a "Mark all as read" button
 * when there are unread notifications.
 */
export function NotificationDropdown({
  notifications,
  isLoading,
  onMarkAsRead,
  onMarkAllAsRead,
  unreadCount,
}: NotificationDropdownProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={<BellOff className="h-6 w-6" />}
        title="No notifications"
        description="You're all caught up. New notifications will appear here."
        className="py-10"
      />
    );
  }

  return (
    <div className="flex flex-col">
      {/* Header with Mark all as read */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold text-foreground">Notifications</span>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={onMarkAllAsRead}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </Button>
        )}
      </div>

      {/* Notification list */}
      <ScrollArea className="max-h-[360px]">
        <div className="flex flex-col gap-0.5 p-1">
          {notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onRead={onMarkAsRead}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
