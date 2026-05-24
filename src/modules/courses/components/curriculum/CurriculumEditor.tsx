// ---------------------------------------------------------------------------
// EduOS — LMS Curriculum Editor
//
// Drag-and-drop curriculum builder using native HTML5 Drag Events.
// Features: module/lesson reordering, inline editing, add/delete dialogs,
// lesson preview toggle, and optimistic UI updates.
// ---------------------------------------------------------------------------

import { useState, useRef, useCallback, DragEvent, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Plus,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Check,
  X,
  Video,
  FileText,
  AlignLeft,
  HelpCircle,
  ClipboardList,
  Radio,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  createModule,
  updateModule,
  deleteModule,
  reorderModules,
  createLesson,
  updateLesson,
  deleteLesson,
  reorderLessons,
} from "@/modules/courses/services/curriculum.service";
import { LessonEditor } from "@/modules/courses/components/curriculum/LessonEditor";
import type { LmsLesson, LmsLessonType, LmsModule } from "@/types";

// ── Types ─────────────────────────────────────────────────────────────────────

type LocalLesson = LmsLesson;
type LocalModule = LmsModule & { lessons: LocalLesson[] };

interface CurriculumEditorProps {
  courseId: string;
  instituteId: string;
  userId: string;
  modules: LocalModule[];
  isCoursePublished?: boolean;
  onRefresh: () => void;
  /** When true, newly added lessons open the content editor immediately (Step 4). */
  openEditorOnLessonAdd?: boolean;
}

// ── Lesson type metadata ──────────────────────────────────────────────────────

const LESSON_TYPE_META: Record<LmsLessonType, { icon: ReactNode; label: string; color: string }> = {
  video: {
    icon: <Video className="h-3.5 w-3.5" />,
    label: "Video",
    color: "text-blue-600",
  },
  pdf: {
    icon: <FileText className="h-3.5 w-3.5" />,
    label: "PDF",
    color: "text-orange-600",
  },
  text: {
    icon: <AlignLeft className="h-3.5 w-3.5" />,
    label: "Text",
    color: "text-slate-600",
  },
  quiz: {
    icon: <HelpCircle className="h-3.5 w-3.5" />,
    label: "Quiz",
    color: "text-purple-600",
  },
  assignment: {
    icon: <ClipboardList className="h-3.5 w-3.5" />,
    label: "Assignment",
    color: "text-green-600",
  },
  live: {
    icon: <Radio className="h-3.5 w-3.5" />,
    label: "Live",
    color: "text-red-600",
  },
};

// ── Add Module Dialog ─────────────────────────────────────────────────────────

interface AddModuleDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (title: string, description: string) => Promise<void>;
}

function AddModuleDialog({ open, onClose, onAdd }: AddModuleDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Module title is required");
      return;
    }
    setSaving(true);
    try {
      await onAdd(title.trim(), description.trim());
      setTitle("");
      setDescription("");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Module</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Module Title <span className="text-destructive">*</span>
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="e.g. Introduction to the Course"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this module covers..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            Add Module
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Lesson Dialog ─────────────────────────────────────────────────────────

interface AddLessonDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (
    title: string,
    lessonType: LmsLessonType,
    isPreview: boolean,
    description: string,
  ) => Promise<void>;
}

function AddLessonDialog({ open, onClose, onAdd }: AddLessonDialogProps) {
  const [title, setTitle] = useState("");
  const [lessonType, setLessonType] = useState<LmsLessonType>("video");
  const [isPreview, setIsPreview] = useState(false);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error("Lesson title is required");
      return;
    }
    setSaving(true);
    try {
      await onAdd(title.trim(), lessonType, isPreview, description.trim());
      setTitle("");
      setLessonType("video");
      setIsPreview(false);
      setDescription("");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Lesson</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">
              Lesson Title <span className="text-destructive">*</span>
            </Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Introduction to Variables"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Lesson Type</Label>
            <Select value={lessonType} onValueChange={(v) => setLessonType(v as LmsLessonType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="video">🎬 Video</SelectItem>
                <SelectItem value="pdf">📄 PDF</SelectItem>
                <SelectItem value="text">📝 Text</SelectItem>
                <SelectItem value="quiz">❓ Quiz</SelectItem>
                <SelectItem value="assignment">📋 Assignment</SelectItem>
                <SelectItem value="live">📡 Live Session</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What will students learn in this lesson?"
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Free Preview</p>
              <p className="text-xs text-muted-foreground">
                Allow non-enrolled students to access this lesson
              </p>
            </div>
            <Switch
              checked={isPreview}
              onCheckedChange={setIsPreview}
              aria-label="Free preview toggle"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            Add Lesson
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Lesson Item ───────────────────────────────────────────────────────────────

interface LessonItemProps {
  lesson: LocalLesson;
  moduleId: string;
  onTogglePreview: (lesson: LocalLesson) => Promise<void>;
  onDelete: (lesson: LocalLesson) => Promise<void>;
  onEdit: (lesson: LocalLesson) => void;
  draggable: boolean;
  onDragStart: (e: DragEvent<HTMLDivElement>, lessonId: string, moduleId: string) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>, targetLessonId: string, targetModuleId: string) => void;
  isDragging: boolean;
  isDropTarget: boolean;
}

function LessonItem({
  lesson,
  onTogglePreview,
  onDelete,
  onEdit,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
  isDropTarget,
}: LessonItemProps) {
  const [isTogglingPreview, setIsTogglingPreview] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const meta = LESSON_TYPE_META[lesson.lesson_type];

  const handleTogglePreview = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsTogglingPreview(true);
    try {
      await onTogglePreview(lesson);
    } finally {
      setIsTogglingPreview(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete lesson "${lesson.title}"? This cannot be undone.`)) return;
    setIsDeleting(true);
    try {
      await onDelete(lesson);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => onDragStart(e, lesson.id, lesson.module_id)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, lesson.id, lesson.module_id)}
      onClick={() => onEdit(lesson)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEdit(lesson);
        }
      }}
      role="button"
      tabIndex={0}
      className={cn(
        "group flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 transition-all cursor-pointer",
        isDragging && "opacity-40 scale-[0.98]",
        isDropTarget && "border-primary bg-primary/5 shadow-sm",
        "hover:border-primary/40 hover:bg-muted/20",
      )}
    >
      {/* Drag handle */}
      <div
        className="cursor-grab text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Lesson type icon */}
      <span className={cn("flex-shrink-0", meta.color)}>{meta.icon}</span>

      {/* Title */}
      <span className="flex-1 text-sm text-foreground truncate" title={lesson.title}>
        {lesson.title}
      </span>

      {/* Type badge */}
      <Badge variant="outline" className="text-[10px] h-5 px-1.5 hidden sm:flex flex-shrink-0">
        {meta.label}
      </Badge>

      {/* Preview badge */}
      {lesson.is_preview && (
        <Badge
          variant="secondary"
          className="text-[10px] h-5 px-1.5 bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 flex-shrink-0"
        >
          Preview
        </Badge>
      )}

      {/* Published indicator */}
      <div
        className={cn(
          "h-1.5 w-1.5 rounded-full flex-shrink-0",
          lesson.is_published ? "bg-green-500" : "bg-muted-foreground/30",
        )}
        title={lesson.is_published ? "Published" : "Draft"}
      />

      {/* Actions */}
      <div
        className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleTogglePreview}
          disabled={isTogglingPreview}
          className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title={lesson.is_preview ? "Remove free preview" : "Set as free preview"}
        >
          {isTogglingPreview ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : lesson.is_preview ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onEdit(lesson)}
          className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Edit lesson"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Delete lesson"
        >
          {isDeleting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}

// ── Module Item ───────────────────────────────────────────────────────────────

interface ModuleItemProps {
  module: LocalModule;
  moduleIndex: number;
  onAddLesson: (moduleId: string) => void;
  onUpdateTitle: (moduleId: string, title: string) => Promise<void>;
  onDelete: (module: LocalModule) => Promise<void>;
  onTogglePreview: (lesson: LocalLesson) => Promise<void>;
  onDeleteLesson: (lesson: LocalLesson) => Promise<void>;
  onEditLesson: (lesson: LocalLesson) => void;
  // Module drag
  onModuleDragStart: (e: DragEvent<HTMLDivElement>, moduleId: string) => void;
  onModuleDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onModuleDrop: (e: DragEvent<HTMLDivElement>, targetModuleId: string) => void;
  isModuleDragging: boolean;
  isModuleDropTarget: boolean;
  // Lesson drag
  onLessonDragStart: (e: DragEvent<HTMLDivElement>, lessonId: string, moduleId: string) => void;
  onLessonDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onLessonDrop: (
    e: DragEvent<HTMLDivElement>,
    targetLessonId: string,
    targetModuleId: string,
  ) => void;
  draggingLessonId: string | null;
  dropTargetLessonId: string | null;
}

function ModuleItem({
  module,
  moduleIndex,
  onAddLesson,
  onUpdateTitle,
  onDelete,
  onTogglePreview,
  onDeleteLesson,
  onEditLesson,
  onModuleDragStart,
  onModuleDragOver,
  onModuleDrop,
  isModuleDragging,
  isModuleDropTarget,
  onLessonDragStart,
  onLessonDragOver,
  onLessonDrop,
  draggingLessonId,
  dropTargetLessonId,
}: ModuleItemProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(module.title);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const handleEditStart = () => {
    setEditTitle(module.title);
    setIsEditing(true);
    setTimeout(() => titleInputRef.current?.focus(), 50);
  };

  const handleTitleSave = async () => {
    if (!editTitle.trim() || editTitle.trim() === module.title) {
      setIsEditing(false);
      return;
    }
    setIsSavingTitle(true);
    try {
      await onUpdateTitle(module.id, editTitle.trim());
      setIsEditing(false);
    } finally {
      setIsSavingTitle(false);
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleTitleSave();
    if (e.key === "Escape") {
      setEditTitle(module.title);
      setIsEditing(false);
    }
  };

  const handleDelete = async () => {
    if (
      !confirm(
        `Delete module "${module.title}" and all its ${module.lessons.length} lessons? This cannot be undone.`,
      )
    )
      return;
    setIsDeleting(true);
    try {
      await onDelete(module);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      draggable
      onDragStart={(e) => onModuleDragStart(e, module.id)}
      onDragOver={onModuleDragOver}
      onDrop={(e) => onModuleDrop(e, module.id)}
      className={cn(
        "rounded-xl border-2 border-border bg-card shadow-sm transition-all",
        isModuleDragging && "opacity-40 scale-[0.99] cursor-grabbing",
        isModuleDropTarget && "border-primary shadow-md",
      )}
    >
      {/* Module header */}
      <div className="flex items-center gap-2 px-4 py-3">
        {/* Drag handle */}
        <div className="cursor-grab text-muted-foreground flex-shrink-0 touch-none">
          <GripVertical className="h-5 w-5" />
        </div>

        {/* Position indicator */}
        <span className="flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
          {moduleIndex + 1}
        </span>

        {/* Title (inline edit) */}
        {isEditing ? (
          <div className="flex-1 flex items-center gap-2">
            <Input
              ref={titleInputRef}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              onKeyDown={handleTitleKeyDown}
              className="h-8 text-sm font-medium"
              disabled={isSavingTitle}
            />
            <button
              type="button"
              onClick={handleTitleSave}
              disabled={isSavingTitle}
              className="rounded p-1.5 text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors"
            >
              {isSavingTitle ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditTitle(module.title);
                setIsEditing(false);
              }}
              className="rounded p-1.5 text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div
            className="flex-1 flex items-center gap-2 cursor-pointer group/title"
            onClick={() => setIsExpanded((e) => !e)}
          >
            <span className="text-sm font-semibold text-foreground group-hover/title:text-primary transition-colors">
              {module.title}
            </span>
            <Badge variant="outline" className="text-[10px] h-4 px-1 flex-shrink-0">
              {module.lessons.length} lesson{module.lessons.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        )}

        {/* Module actions */}
        {!isEditing && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={handleEditStart}
              className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Rename module"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="rounded p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Delete module"
            >
              {isDeleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setIsExpanded((e) => !e)}
              className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors ml-1"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Lessons list */}
      {isExpanded && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          {module.lessons.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No lessons yet. Add your first lesson below.
            </p>
          ) : (
            module.lessons.map((lesson) => (
              <LessonItem
                key={lesson.id}
                lesson={lesson}
                moduleId={module.id}
                onTogglePreview={onTogglePreview}
                onDelete={onDeleteLesson}
                onEdit={onEditLesson}
                draggable={true}
                onDragStart={onLessonDragStart}
                onDragOver={onLessonDragOver}
                onDrop={onLessonDrop}
                isDragging={draggingLessonId === lesson.id}
                isDropTarget={dropTargetLessonId === lesson.id}
              />
            ))
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary hover:bg-primary/5 h-9"
            onClick={() => onAddLesson(module.id)}
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Lesson
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function CurriculumEditor({
  courseId,
  instituteId,
  userId,
  modules: initialModules,
  isCoursePublished = false,
  onRefresh,
  openEditorOnLessonAdd = false,
}: CurriculumEditorProps) {
  // Optimistic local copy
  const [localModules, setLocalModules] = useState<LocalModule[]>(initialModules);
  const [showAddModule, setShowAddModule] = useState(false);
  const [addingLessonToModule, setAddingLessonToModule] = useState<string | null>(null);

  // LessonEditor callback
  const [editingLesson, setEditingLesson] = useState<LocalLesson | null>(null);

  // Drag state for modules
  const [draggingModuleId, setDraggingModuleId] = useState<string | null>(null);
  const [dropTargetModuleId, setDropTargetModuleId] = useState<string | null>(null);

  // Drag state for lessons
  const [draggingLesson, setDraggingLesson] = useState<{
    lessonId: string;
    moduleId: string;
  } | null>(null);
  const [dropTargetLessonId, setDropTargetLessonId] = useState<string | null>(null);

  const dragOverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Sync prop changes to local state ──────────────────────────────────────

  // When parent refreshes (e.g., after save), sync modules
  const prevInitialRef = useRef(initialModules);
  if (prevInitialRef.current !== initialModules) {
    prevInitialRef.current = initialModules;
    setLocalModules(initialModules);
  }

  // ── Module CRUD ───────────────────────────────────────────────────────────

  const handleAddModule = useCallback(
    async (title: string, description: string) => {
      const nextPosition = localModules.length;
      const result = await createModule(
        {
          course_id: courseId,
          title,
          description,
          position: nextPosition,
          is_published: isCoursePublished,
        },
        instituteId,
      );
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Failed to create module");
        return;
      }
      toast.success("Module added");
      setLocalModules((prev) => [...prev, { ...result.data!, lessons: [] }]);
    },
    [courseId, instituteId, localModules.length],
  );

  const handleUpdateModuleTitle = useCallback(async (moduleId: string, title: string) => {
    const result = await updateModule(moduleId, { title });
    if (!result.success) {
      toast.error(result.error ?? "Failed to update module");
      return;
    }
    setLocalModules((prev) => prev.map((m) => (m.id === moduleId ? { ...m, title } : m)));
    toast.success("Module renamed");
  }, []);

  const handleDeleteModule = useCallback(async (module: LocalModule) => {
    const result = await deleteModule(module.id);
    if (!result.success) {
      toast.error(result.error ?? "Failed to delete module");
      return;
    }
    toast.success("Module deleted");
    setLocalModules((prev) => prev.filter((m) => m.id !== module.id));
  }, []);

  // ── Lesson CRUD ───────────────────────────────────────────────────────────

  const handleAddLesson = useCallback(
    async (
      moduleId: string,
      title: string,
      lessonType: LmsLessonType,
      isPreview: boolean,
      description: string,
    ) => {
      const mod = localModules.find((m) => m.id === moduleId);
      if (!mod) return;
      const position = mod.lessons.length;

      const result = await createLesson(
        {
          module_id: moduleId,
          course_id: courseId,
          title,
          description,
          lesson_type: lessonType,
          position,
          is_preview: isPreview,
          is_published: isCoursePublished,
        },
        instituteId,
      );
      if (!result.success || !result.data) {
        toast.error(result.error ?? "Failed to create lesson");
        return;
      }
      toast.success("Lesson added");
      const newLesson = result.data!;
      setLocalModules((prev) =>
        prev.map((m) => (m.id === moduleId ? { ...m, lessons: [...m.lessons, newLesson] } : m)),
      );
      if (openEditorOnLessonAdd) {
        setEditingLesson(newLesson);
      }
    },
    [courseId, instituteId, localModules, openEditorOnLessonAdd],
  );

  const handleTogglePreview = useCallback(async (lesson: LocalLesson) => {
    const newVal = !lesson.is_preview;
    const result = await updateLesson(lesson.id, { is_preview: newVal });
    if (!result.success) {
      toast.error(result.error ?? "Failed to update lesson");
      return;
    }
    setLocalModules((prev) =>
      prev.map((m) => ({
        ...m,
        lessons: m.lessons.map((l) => (l.id === lesson.id ? { ...l, is_preview: newVal } : l)),
      })),
    );
    toast.success(newVal ? "Lesson set as free preview" : "Preview removed");
  }, []);

  const handleDeleteLesson = useCallback(async (lesson: LocalLesson) => {
    const result = await deleteLesson(lesson.id);
    if (!result.success) {
      toast.error(result.error ?? "Failed to delete lesson");
      return;
    }
    toast.success("Lesson deleted");
    setLocalModules((prev) =>
      prev.map((m) => ({
        ...m,
        lessons: m.lessons.filter((l) => l.id !== lesson.id),
      })),
    );
  }, []);

  // ── Module Drag & Drop ────────────────────────────────────────────────────

  const handleModuleDragStart = useCallback((e: DragEvent, moduleId: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", moduleId);
    setDraggingModuleId(moduleId);
  }, []);

  const handleModuleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleModuleDrop = useCallback(
    (e: DragEvent, targetModuleId: string) => {
      e.preventDefault();
      setDropTargetModuleId(null);

      const sourceId = draggingModuleId;
      setDraggingModuleId(null);

      if (!sourceId || sourceId === targetModuleId) return;

      const reordered = [...localModules];
      const fromIdx = reordered.findIndex((m) => m.id === sourceId);
      const toIdx = reordered.findIndex((m) => m.id === targetModuleId);
      if (fromIdx === -1 || toIdx === -1) return;

      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);

      const withPositions = reordered.map((m, i) => ({ ...m, position: i }));
      setLocalModules(withPositions);

      // Persist
      reorderModules(withPositions.map((m) => ({ id: m.id, position: m.position }))).then((res) => {
        if (!res.success) toast.error("Failed to save module order");
      });
    },
    [draggingModuleId, localModules],
  );

  const handleModuleDragEnter = useCallback((_e: DragEvent, moduleId: string) => {
    if (dragOverTimeout.current) clearTimeout(dragOverTimeout.current);
    setDropTargetModuleId(moduleId);
  }, []);

  // ── Lesson Drag & Drop ────────────────────────────────────────────────────

  const handleLessonDragStart = useCallback((e: DragEvent, lessonId: string, moduleId: string) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", `${moduleId}:${lessonId}`);
    setDraggingLesson({ lessonId, moduleId });
  }, []);

  const handleLessonDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleLessonDrop = useCallback(
    (e: DragEvent, targetLessonId: string, targetModuleId: string) => {
      e.preventDefault();
      e.stopPropagation();
      setDropTargetLessonId(null);

      const source = draggingLesson;
      setDraggingLesson(null);

      if (!source || source.lessonId === targetLessonId) return;
      // Only support reordering within same module for now
      if (source.moduleId !== targetModuleId) return;

      setLocalModules((prev) =>
        prev.map((m) => {
          if (m.id !== source.moduleId) return m;
          const lessons = [...m.lessons];
          const fromIdx = lessons.findIndex((l) => l.id === source.lessonId);
          const toIdx = lessons.findIndex((l) => l.id === targetLessonId);
          if (fromIdx === -1 || toIdx === -1) return m;
          const [moved] = lessons.splice(fromIdx, 1);
          lessons.splice(toIdx, 0, moved);
          const withPositions = lessons.map((l, i) => ({ ...l, position: i }));

          // Persist
          reorderLessons(withPositions.map((l) => ({ id: l.id, position: l.position }))).then(
            (res) => {
              if (!res.success) toast.error("Failed to save lesson order");
            },
          );

          return { ...m, lessons: withPositions };
        }),
      );
    },
    [draggingLesson],
  );

  const handleLessonDragEnter = useCallback((_e: DragEvent, lessonId: string) => {
    setDropTargetLessonId(lessonId);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  const totalLessons = localModules.reduce((sum, m) => sum + m.lessons.length, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            {localModules.length} module{localModules.length !== 1 ? "s" : ""} • {totalLessons}{" "}
            lesson{totalLessons !== 1 ? "s" : ""}
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => setShowAddModule(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          Add Module
        </Button>
      </div>

      {/* Empty state */}
      {localModules.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-border p-12 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-full bg-muted p-4">
              <AlignLeft className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No modules yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Start building your curriculum by adding your first module (section).
              </p>
            </div>
            <Button type="button" onClick={() => setShowAddModule(true)} className="mt-2 gap-1.5">
              <Plus className="h-4 w-4" />
              Add First Module
            </Button>
          </div>
        </div>
      )}

      {/* Module list */}
      <div
        className="space-y-3"
        onDragEnd={() => {
          setDraggingModuleId(null);
          setDropTargetModuleId(null);
          setDraggingLesson(null);
          setDropTargetLessonId(null);
        }}
      >
        {localModules.map((module, idx) => (
          <div key={module.id} onDragEnter={(e) => handleModuleDragEnter(e, module.id)}>
            <ModuleItem
              module={module}
              moduleIndex={idx}
              onAddLesson={(moduleId) => setAddingLessonToModule(moduleId)}
              onUpdateTitle={handleUpdateModuleTitle}
              onDelete={handleDeleteModule}
              onTogglePreview={handleTogglePreview}
              onDeleteLesson={handleDeleteLesson}
              onEditLesson={setEditingLesson}
              onModuleDragStart={handleModuleDragStart}
              onModuleDragOver={handleModuleDragOver}
              onModuleDrop={handleModuleDrop}
              isModuleDragging={draggingModuleId === module.id}
              isModuleDropTarget={dropTargetModuleId === module.id}
              onLessonDragStart={handleLessonDragStart}
              onLessonDragOver={handleLessonDragOver}
              onLessonDrop={handleLessonDrop}
              draggingLessonId={draggingLesson?.lessonId ?? null}
              dropTargetLessonId={dropTargetLessonId}
            />
          </div>
        ))}
      </div>

      {/* Drag hint */}
      {localModules.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Drag modules and lessons to reorder them
        </p>
      )}

      {/* Add Module Dialog */}
      <AddModuleDialog
        open={showAddModule}
        onClose={() => setShowAddModule(false)}
        onAdd={handleAddModule}
      />

      {/* Add Lesson Dialog */}
      <AddLessonDialog
        open={!!addingLessonToModule}
        onClose={() => setAddingLessonToModule(null)}
        onAdd={async (title, lessonType, isPreview, description) => {
          if (!addingLessonToModule) return;
          await handleAddLesson(addingLessonToModule, title, lessonType, isPreview, description);
        }}
      />

      {/* Lesson content editor (video, PDF, text, quiz, assignment) */}
      {editingLesson && userId && (
        <LessonEditor
          lesson={
            localModules.flatMap((m) => m.lessons).find((l) => l.id === editingLesson.id) ??
            editingLesson
          }
          courseId={courseId}
          instituteId={instituteId}
          userId={userId}
          open
          onClose={() => setEditingLesson(null)}
          onUpdate={(updated) => {
            setLocalModules((prev) =>
              prev.map((m) => ({
                ...m,
                lessons: m.lessons.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)),
              })),
            );
            setEditingLesson(updated);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}
