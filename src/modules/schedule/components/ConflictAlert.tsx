import { AlertTriangle } from "lucide-react";
import type { ScheduleConflict } from "@/types";

interface ConflictAlertProps {
  conflicts: ScheduleConflict[];
}

export function ConflictAlert({ conflicts }: ConflictAlertProps) {
  if (conflicts.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-medium text-foreground">Schedule conflicts detected</p>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {conflicts.map((c, i) => (
              <li key={`${c.type}-${i}`}>{c.message}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
