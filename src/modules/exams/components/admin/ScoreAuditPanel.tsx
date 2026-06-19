import { useEffect, useState } from "react";
import { format } from "date-fns";
import { History, Loader2 } from "lucide-react";

import {
  listAttemptScoreAudits,
  type ExamScoreAudit,
} from "@/modules/exams/services/exam.service";

interface ScoreAuditPanelProps {
  attemptId: string;
  /**
   * Bumping this from the parent forces a refetch — useful right after a
   * successful edit so the panel reflects the new audit row immediately.
   */
  refreshKey?: number;
}

/**
 * Read-only panel showing the audit trail of manual score edits for a
 * single attempt (Req 6). Designed to be rendered inline beneath the
 * attempt row in `AttemptList`.
 *
 * Rows are returned newest-first by the service (ORDER BY edited_at DESC),
 * matching the spec's "chronological descending" requirement.
 */
export function ScoreAuditPanel({ attemptId, refreshKey = 0 }: ScoreAuditPanelProps) {
  const [audits, setAudits] = useState<ExamScoreAudit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      setIsLoading(true);
      setError(null);
      const { data, success, error: fetchError } = await listAttemptScoreAudits(attemptId);
      if (cancelled) return;
      if (success && data) {
        setAudits(data);
      } else {
        setAudits([]);
        setError(fetchError ?? "Failed to load audit log");
      }
      setIsLoading(false);
    };
    fetch();
    return () => {
      cancelled = true;
    };
  }, [attemptId, refreshKey]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading audit log…
      </div>
    );
  }

  if (error) {
    return <p className="py-4 text-sm text-destructive">{error}</p>;
  }

  if (audits.length === 0) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <History className="h-4 w-4" />
        No manual score edits
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="text-left font-medium px-3 py-2">Editor</th>
            <th className="text-left font-medium px-3 py-2">Edited At</th>
            <th className="text-left font-medium px-3 py-2">Old → New</th>
            <th className="text-left font-medium px-3 py-2">Reason</th>
          </tr>
        </thead>
        <tbody>
          {audits.map((row) => (
            <tr key={row.id} className="border-t">
              <td className="px-3 py-2 font-medium">{row.editor_name ?? "Unknown editor"}</td>
              <td className="px-3 py-2 text-muted-foreground">
                {format(new Date(row.edited_at), "MMM d, yyyy h:mm a")}
              </td>
              <td className="px-3 py-2">
                <span className="text-muted-foreground">{row.old_score}</span>
                <span className="mx-1 text-muted-foreground">→</span>
                <span className="font-medium">{row.new_score}</span>
              </td>
              <td className="px-3 py-2 max-w-[420px]">
                <span className="block whitespace-pre-wrap break-words" title={row.reason}>
                  {row.reason}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
