import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, X, Plus, Trash2, FileText, Calendar, Clock, Award, Upload, FileIcon } from "lucide-react";
import { useState, useRef } from "react";
import { format } from "date-fns";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  assignmentSchema as assignmentFormSchema,
  type AssignmentSchema,
} from "@/modules/assignments/validations";
import type { Assignment, AssignmentResourceSchema } from "@/types";
import { uploadAssignmentFile } from "@/modules/assignments/services/assignment.service";
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";

interface AssignmentFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: AssignmentSchema, resources?: AssignmentResourceSchema[]) => Promise<void>;
  initialData?: Assignment | null;
  mode: "create" | "edit";
}

export function AssignmentFormModal({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  mode,
}: AssignmentFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [resources, setResources] = useState<AssignmentResourceSchema[]>(initialData?.resources ?? []);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuthStore();

  const form = useForm<AssignmentSchema>({
    resolver: zodResolver(assignmentFormSchema),
    defaultValues: {
      title: initialData?.title ?? "",
      description: initialData?.description ?? "",
      instructions: initialData?.instructions ?? "",
      total_marks: initialData?.total_marks ?? 100,
      due_date: initialData?.due_date ? format(new Date(initialData.due_date), "yyyy-MM-dd'T'HH:mm") : "",
      allow_late: initialData?.allow_late ?? true,
      status: initialData?.status ?? "draft",
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !user?.institute_id) return;

    setUploadingFiles(true);
    const newResources: AssignmentResourceSchema[] = [...resources];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const res = await uploadAssignmentFile(user.institute_id, "assignment-resources", file, "resources");
      
      if (res.success && res.data) {
        newResources.push({
          file_name: file.name,
          file_url: res.data.url,
          storage_path: res.data.path,
          file_type: file.type,
          file_size: file.size,
        });
      } else {
        toast.error(`Failed to upload ${file.name}: ${res.error}`);
      }
    }

    setResources(newResources);
    setUploadingFiles(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeResource = (index: number) => {
    setResources(resources.filter((_, i) => i !== index));
  };

  const handleFormSubmit = async (data: AssignmentSchema) => {
    try {
      setIsSubmitting(true);
      await onSubmit(data, resources);
      form.reset();
      setResources([]);
      onClose();
    } catch (error) {
      console.error("Failed to submit assignment:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Create New Assignment" : "Edit Assignment"}</DialogTitle>
          <DialogDescription>
            Fill in the details for the standalone assignment. This will not be linked to any course.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="title">Assignment Title</Label>
            <Input
              id="title"
              placeholder="e.g., Mid-Term Research Paper"
              {...form.register("title")}
              className={form.formState.errors.title ? "border-destructive" : ""}
            />
            {form.formState.errors.title && (
              <p className="text-xs text-destructive">{form.formState.errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description / Overview</Label>
            <Textarea
              id="description"
              placeholder="Provide a brief overview of the assignment..."
              {...form.register("description")}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="instructions">Detailed Instructions</Label>
            <Textarea
              id="instructions"
              placeholder="Step-by-step instructions for students..."
              {...form.register("instructions")}
              rows={5}
            />
          </div>

          <div className="space-y-3">
            <Label>Reference Files & Resources</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {resources.map((res, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileIcon className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm truncate font-medium">{res.file_name}</span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => removeResource(index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFiles}
                className="flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-lg hover:border-primary/50 hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary min-h-[80px]"
              >
                {uploadingFiles ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <Upload className="h-5 w-5 mb-1" />
                    <span className="text-xs font-medium">Upload Files</span>
                  </>
                )}
              </button>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                multiple
                onChange={handleFileUpload}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="total_marks">Total Marks</Label>
              <div className="relative">
                <Award className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="total_marks"
                  type="number"
                  className="pl-9"
                  {...form.register("total_marks")}
                />
              </div>
              {form.formState.errors.total_marks && (
                <p className="text-xs text-destructive">{form.formState.errors.total_marks.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="due_date">Due Date & Time</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="due_date"
                  type="datetime-local"
                  className="pl-9"
                  {...form.register("due_date")}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="allow_late"
                checked={form.watch("allow_late")}
                onCheckedChange={(checked) => form.setValue("allow_late", !!checked)}
              />
              <div className="grid gap-1.5 leading-none">
                <label
                  htmlFor="allow_late"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Allow late submissions
                </label>
                <p className="text-xs text-muted-foreground">
                  Students can submit after the due date (marked as late).
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Publishing Status</Label>
              <Select
                value={form.watch("status")}
                onValueChange={(value: any) => form.setValue("status", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft (Private)</SelectItem>
                  <SelectItem value="published">Published (Visible to Students)</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || uploadingFiles}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "create" ? "Create Assignment" : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
