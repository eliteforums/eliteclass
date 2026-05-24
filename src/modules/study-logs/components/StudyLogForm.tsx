import { useState, useEffect } from "react";
import { Save, Loader2, AlertCircle, CheckCircle2, Info } from "lucide-react";
import { toast } from "sonner";
import { format, isYesterday, isToday, parseISO } from "date-fns";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { upsertStudyLog } from "@/services/studyLog.service";
import type { DailyStudyLog, CreateStudyLogPayload } from "@/types";

interface StudyLogFormProps {
  studentId: string;
  batchId: string;
  instituteId: string;
  existingLog?: DailyStudyLog | null;
  selectedDate: string; // ISO Date string (YYYY-MM-DD)
  onSuccess?: (log: DailyStudyLog) => void;
}

export function StudyLogForm({
  studentId,
  batchId,
  instituteId,
  existingLog,
  selectedDate,
  onSuccess,
}: StudyLogFormProps) {
  const [title, setTitle] = useState(existingLog?.title ?? "");
  const [description, setDescription] = useState(existingLog?.description ?? "");
  const [attachmentUrl, setAttachmentUrl] = useState(existingLog?.attachment_url ?? "");
  const [isSaving, setIsSaving] = useState(false);

  // Sync with existing log when it changes
  useEffect(() => {
    setTitle(existingLog?.title ?? "");
    setDescription(existingLog?.description ?? "");
    setAttachmentUrl(existingLog?.attachment_url ?? "");
  }, [existingLog]);

  const dateObj = parseISO(selectedDate);
  const isLocked = existingLog?.is_locked || (function() {
    const now = new Date();
    const cutoff = new Date(dateObj);
    cutoff.setDate(cutoff.getDate() + 2); // Next day + 1 = day after next
    cutoff.setHours(0, 0, 0, 0); // Midnight of day after next (which is 11:59:59 PM of next day)
    return now >= cutoff;
  })();

  const isTodayDate = isToday(dateObj);
  const isYesterdayDate = isYesterday(dateObj);
  
  const canEdit = !isLocked && (isTodayDate || isYesterdayDate);

  const handleSave = async () => {
    if (!title.trim() || !description.trim()) {
      toast.error("Title and description are required.");
      return;
    }

    if (!instituteId) {
      console.error("[StudyLogForm] Missing instituteId", { studentId, batchId });
      toast.error("Session error: Institute ID is missing. Please refresh the page.");
      return;
    }

    setIsSaving(true);
    const payload: CreateStudyLogPayload = {
      student_id: studentId,
      batch_id: batchId,
      institute_id: instituteId,
      title: title.trim(),
      description: description.trim(),
      log_date: selectedDate,
      attachment_url: attachmentUrl.trim() || undefined,
    };

    const result = await upsertStudyLog(payload);
    setIsSaving(false);

    if (result.success && result.data) {
      toast.success(existingLog ? "Log updated successfully." : "Log submitted successfully.");
      onSuccess?.(result.data);
    } else {
      toast.error(result.error ?? "Failed to save study log.");
    }
  };

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-bold">
              {format(dateObj, "EEEE, MMMM do")}
            </CardTitle>
            <CardDescription>
              {isTodayDate ? "Today's Progress" : isYesterdayDate ? "Yesterday's Progress" : "Past Progress"}
            </CardDescription>
          </div>
          <div className="flex flex-col items-end gap-1">
            {isLocked ? (
              <Badge variant="secondary" className="bg-muted text-muted-foreground">
                Locked
              </Badge>
            ) : existingLog ? (
              <Badge variant="default" className="bg-green-500/10 text-green-500">
                Submitted {existingLog.is_late && "• Late"}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-yellow-500 border-yellow-500/50">
                Pending
              </Badge>
            )}
            {!isLocked && (isTodayDate || isYesterdayDate) && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    Editable until {format(new Date(new Date(dateObj).setDate(dateObj.getDate() + 1)), "MMM do")} 11:59 PM
                </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canEdit || isSaving}
            placeholder="e.g., Mathematics - Calculus Basics"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">What did you study today?</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!canEdit || isSaving}
            rows={5}
            placeholder="Describe your progress, topics covered, and any challenges..."
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-primary/20 disabled:opacity-50 resize-none"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">Attachment Link (Optional)</label>
          <input
            type="url"
            value={attachmentUrl}
            onChange={(e) => setAttachmentUrl(e.target.value)}
            disabled={!canEdit || isSaving}
            placeholder="https://link-to-your-work.com"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          />
        </div>

        {canEdit && (
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full gap-2"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {existingLog ? "Update Submission" : "Submit Progress"}
          </Button>
        )}

        {!canEdit && !isLocked && !isTodayDate && !isYesterdayDate && (
            <div className="flex items-center gap-2 rounded-lg bg-yellow-500/10 p-3 text-xs text-yellow-500 border border-yellow-500/20">
                <AlertCircle className="h-4 w-4" />
                <span>You can only submit logs for today or yesterday.</span>
            </div>
        )}

        {isLocked && (
            <div className="flex items-center gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground border border-border">
                <Lock className="h-4 w-4" />
                <span>This entry is locked and can no longer be edited.</span>
            </div>
        )}
      </CardContent>
    </Card>
  );
}

function Lock({ className }: { className?: string }) {
    return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
}
