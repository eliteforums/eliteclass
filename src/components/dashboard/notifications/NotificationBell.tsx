import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NotificationDropdown } from "./NotificationDropdown";
import { useNotifications } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

/**
 * Formats the unread count for display on the badge.
 * Shows exact count for 1-99, "99+" for >99, and returns null when 0 (badge hidden).
 */
function formatBadgeCount(count: number): string | null {
  if (count <= 0) return null;
  if (count > 99) return "99+";
  return String(count);
}

/**
 * NotificationBell — bell icon button with an unread count badge.
 * Opens a popover dropdown showing recent notifications.
 *
 * Requirements: 5.2, 5.3, 5.4, 5.8, 5.9
 */
export function NotificationBell() {
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead } =
    useNotifications();

  const badgeText = formatBadgeCount(unreadCount);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            badgeText
              ? `Notifications (${unreadCount} unread)`
              : "Notifications"
          }
        >
          <Bell className="h-4 w-4" />
          {badgeText && (
            <span
              className={cn(
                "absolute flex items-center justify-center rounded-full bg-destructive text-destructive-foreground font-medium",
                badgeText.length <= 2
                  ? "right-1 top-1 h-4 w-4 text-[10px]"
                  : "right-0.5 top-0.5 h-4 min-w-[1.1rem] px-0.5 text-[9px]",
              )}
            >
              {badgeText}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 p-0 sm:w-96"
        sideOffset={8}
      >
        <NotificationDropdown
          notifications={notifications}
          isLoading={isLoading}
          onMarkAsRead={markAsRead}
          onMarkAllAsRead={markAllAsRead}
          unreadCount={unreadCount}
        />
      </PopoverContent>
    </Popover>
  );
}
