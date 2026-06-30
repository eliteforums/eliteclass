// ---------------------------------------------------------------------------
// NotificationCompose — Form for admins/instructors to send notifications
//
// Features:
// - Role-aware recipient targeting via RecipientSelector
// - Title (1-100 chars) and body (1-500 chars) validation with inline errors
// - Confirmation with student count on success
// - Error toast on failure, preserves form state
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Send, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/store/authStore";
import {
  broadcastNotification,
  sendBatchNotification,
  validateNotificationFields,
  type ValidationError,
} from "@/services/notification.service";
import { getAssignableStudents } from "@/services/batch.service";

import {
  RecipientSelector,
  type RecipientSelection,
} from "./RecipientSelector";

interface FieldErrors {
  title?: string;
  body?: string;
  recipients?: string;
}

export function NotificationCompose() {
  const user = useAuthStore((s) => s.user);
  const instituteId = user?.institute_id ?? "";
  const senderId = user?.id ?? "";

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [recipient, setRecipient] = useState<RecipientSelection>({
    targetType: "all",
    estimatedCount: 0,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSending, setIsSending] = useState(false);
  const [successCount, setSuccessCount] = useState<number | null>(null);

  function validate(): boolean {
    const fieldErrors: FieldErrors = {};

    // Validate title and body using the service-level validator
    const validationErrors: ValidationError[] = validateNotificationFields(title, body);
    for (const err of validationErrors) {
      if (err.field === "title") fieldErrors.title = err.message;
      if (err.field === "body") fieldErrors.body = err.message;
    }

    // Validate recipient selection
    if (recipient.targetType === "batch" && !recipient.batchId) {
      fieldErrors.recipients = "Please select a batch.";
    } else if (
      recipient.targetType === "individual" &&
      (!recipient.studentIds || recipient.studentIds.length === 0)
    ) {
      fieldErrors.recipients = "Please select at least one student.";
    }

    setErrors(fieldErrors);
    return Object.keys(fieldErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSuccessCount(null);

    if (!validate()) return;

    setIsSending(true);

    try {
      if (recipient.targetType === "all") {
        // Resolve every student's auth user_id (recipient_id == users.id).
        const studentsResult = await getAssignableStudents(instituteId);
        if (!studentsResult.success || !studentsResult.data) {
          toast.error(studentsResult.error ?? "Failed to fetch students.");
          setIsSending(false);
          return;
        }
        if (studentsResult.data.length === 0) {
          toast.error("No students found in your institute.");
          setIsSending(false);
          return;
        }

        const recipientIds = studentsResult.data
          .map((s) => s.user_id ?? s.user?.id)
          .filter((id): id is string => !!id);

        // Single RPC round-trip — bulk insert via SECURITY DEFINER function.
        const result = await broadcastNotification(title.trim(), body.trim(), recipientIds);

        if (result.success && result.data) {
          if (result.data.count === 0) {
            toast.warning(
              "No notifications were sent. Recipients may be missing from your institute.",
            );
          } else {
            setSuccessCount(result.data.count);
            resetForm();
          }
        } else {
          toast.error(result.error ?? "Failed to send notifications.");
        }
      } else if (recipient.targetType === "batch" && recipient.batchId) {
        // Send batch notification (already a single SELECT + INSERT)
        const result = await sendBatchNotification(
          recipient.batchId,
          title.trim(),
          body.trim(),
          senderId,
          instituteId,
        );

        if (result.success && result.data) {
          if (result.data.count === 0) {
            toast.warning("Batch has no active members to notify.");
          } else {
            setSuccessCount(result.data.count);
            resetForm();
          }
        } else {
          toast.error(result.error ?? "Failed to send batch notification.");
        }
      } else if (
        recipient.targetType === "individual" &&
        recipient.studentIds &&
        recipient.studentIds.length > 0
      ) {
        // recipient.studentIds is already a list of users.id values
        // (RecipientSelector resolves student_id → user_id on toggle).
        const result = await broadcastNotification(
          title.trim(),
          body.trim(),
          recipient.studentIds,
        );

        if (result.success && result.data) {
          if (result.data.count === 0) {
            toast.warning("No notifications were sent. Selected users may be outside your institute.");
          } else {
            setSuccessCount(result.data.count);
            resetForm();
          }
        } else {
          toast.error(result.error ?? "Failed to send notifications.");
        }
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "An unexpected error occurred.",
      );
    } finally {
      setIsSending(false);
    }
  }

  function resetForm() {
    setTitle("");
    setBody("");
    setRecipient({ targetType: "all", estimatedCount: 0 });
    setErrors({});
  }

  function dismissSuccess() {
    setSuccessCount(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Send className="h-5 w-5 text-primary" />
          Compose Notification
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Success confirmation */}
        {successCount !== null && (
          <div
            className="mb-6 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-950/30"
            role="alert"
          >
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                Notification sent successfully!
              </p>
              <p className="text-xs text-green-600 dark:text-green-400">
                {successCount} student{successCount !== 1 ? "s" : ""} notified.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={dismissSuccess}
              className="text-green-600 hover:text-green-800"
            >
              Dismiss
            </Button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Recipient selection */}
          <RecipientSelector
            value={recipient}
            onChange={(sel) => {
              setRecipient(sel);
              if (errors.recipients) setErrors((prev) => ({ ...prev, recipients: undefined }));
            }}
            disabled={isSending}
          />
          {errors.recipients && (
            <p className="text-xs text-destructive -mt-2">{errors.recipients}</p>
          )}

          {/* Title field */}
          <div className="space-y-2">
            <Label htmlFor="notification-title">
              Title
              <span className="ml-1 text-xs text-muted-foreground font-normal">
                ({title.length}/100)
              </span>
            </Label>
            <Input
              id="notification-title"
              placeholder="Notification title..."
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
              }}
              maxLength={110}
              disabled={isSending}
              aria-invalid={!!errors.title}
              aria-describedby={errors.title ? "title-error" : undefined}
            />
            {errors.title && (
              <p id="title-error" className="text-xs text-destructive">
                {errors.title}
              </p>
            )}
          </div>

          {/* Body field */}
          <div className="space-y-2">
            <Label htmlFor="notification-body">
              Message
              <span className="ml-1 text-xs text-muted-foreground font-normal">
                ({body.length}/500)
              </span>
            </Label>
            <Textarea
              id="notification-body"
              placeholder="Write your notification message..."
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                if (errors.body) setErrors((prev) => ({ ...prev, body: undefined }));
              }}
              maxLength={510}
              rows={4}
              disabled={isSending}
              aria-invalid={!!errors.body}
              aria-describedby={errors.body ? "body-error" : undefined}
            />
            {errors.body && (
              <p id="body-error" className="text-xs text-destructive">
                {errors.body}
              </p>
            )}
          </div>

          {/* Submit */}
          <Button type="submit" disabled={isSending} className="w-full sm:w-auto">
            {isSending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send Notification
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
