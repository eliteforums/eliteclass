import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AttendanceStatus, StudentAttendanceRecord } from "@/types";
import { ArrowDown, ArrowUp, CalendarRange, Filter, Search } from "lucide-react";
import { format, parseISO } from "date-fns";

interface AttendanceHistoryTableProps {
  records: StudentAttendanceRecord[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
  statusFilter: AttendanceStatus | "all";
  sortDirection: "newest" | "oldest";
  onSearchChange: (value: string) => void;
  onStatusChange: (value: AttendanceStatus | "all") => void;
  onSortChange: (value: "newest" | "oldest") => void;
  onPageChange: (value: number) => void;
}

const STATUS_TONES: Record<AttendanceStatus, string> = {
  present: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  absent: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  late: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  leave: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
};

function formatSessionDate(value: string | undefined): string {
  if (!value) return "Unknown";
  return format(parseISO(value), "dd MMM yyyy");
}

export function AttendanceHistoryTable({
  records,
  total,
  page,
  pageSize,
  search,
  statusFilter,
  sortDirection,
  onSearchChange,
  onStatusChange,
  onSortChange,
  onPageChange,
}: AttendanceHistoryTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Card className="border-border/60 bg-card/90 shadow-sm backdrop-blur">
      <CardHeader className="space-y-4 border-b border-border/60 bg-gradient-to-br from-background via-background to-muted/20 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
              Attendance history
            </p>
            <CardTitle className="mt-1 text-xl">Recent sessions</CardTitle>
          </div>
          <Badge variant="outline" className="gap-1.5">
            <CalendarRange className="size-3.5" />
            {total} record{total === 1 ? "" : "s"}
          </Badge>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_180px_160px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search by session date or status"
              className="pl-9"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(value) => onStatusChange(value as AttendanceStatus | "all")}
          >
            <SelectTrigger>
              <div className="flex items-center gap-2">
                <Filter className="size-4 text-muted-foreground" />
                <SelectValue placeholder="Status" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="present">Present</SelectItem>
              <SelectItem value="absent">Absent</SelectItem>
              <SelectItem value="late">Late</SelectItem>
              <SelectItem value="leave">Leave</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => onSortChange(sortDirection === "newest" ? "oldest" : "newest")}
          >
            {sortDirection === "newest" ? (
              <ArrowDown className="mr-2 size-4" />
            ) : (
              <ArrowUp className="mr-2 size-4" />
            )}
            {sortDirection === "newest" ? "Newest first" : "Oldest first"}
          </Button>
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => onPageChange(Math.max(1, page - 1))}
              disabled={page <= 1}
            >
              <ArrowUp className="size-4 rotate-[-90deg]" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => onPageChange(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
            >
              <ArrowUp className="size-4 rotate-90" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border/60">
            <thead className="bg-muted/30 text-left text-xs uppercase tracking-[0.2em] text-muted-foreground">
              <tr>
                <th className="px-6 py-4 font-medium">Session date</th>
                <th className="px-6 py-4 font-medium">Batch</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Marked on</th>
                <th className="px-6 py-4 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 bg-background/80">
              {records.length > 0 ? (
                records.map((record) => (
                  <tr key={record.id} className="transition-colors hover:bg-muted/20">
                    <td className="px-6 py-4 text-sm font-medium text-foreground">
                      {formatSessionDate(record.session?.session_date)}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {record.session?.batch?.name ?? "General"}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                          STATUS_TONES[record.status],
                        )}
                      >
                        {record.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {format(parseISO(record.marked_at), "dd MMM yyyy, h:mm a")}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {record.notes ?? "-"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center text-sm text-muted-foreground">
                    No attendance records match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border/60 px-6 py-4 text-sm text-muted-foreground">
          <p>
            Page {page} of {totalPages}
          </p>
          <p>
            Showing {records.length} of {total} records
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
