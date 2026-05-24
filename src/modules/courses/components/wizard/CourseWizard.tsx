// ---------------------------------------------------------------------------
// EduOS — Course Creation / Editing Wizard
//
// 6-step wizard for creating and editing LMS courses.
//
// Steps:
//   1. Basic Info     — title, category, difficulty, visibility, pricing…
//   2. Media & Intro  — thumbnail upload, intro video
//   3. Curriculum     — modules & lessons drag-and-drop editor
//   4. Content        — upload lesson files / videos
//   5. Assessments    — configure quizzes and assignments per lesson
//   6. Publish        — review summary, set status, go live
//
// In CREATE mode: courseId is null until Step 1 saves successfully.
// In EDIT mode  : courseId is provided; course is pre-loaded on mount.
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BookOpen,
  Image,
  LayoutList,
  Upload,
  ClipboardList,
  Rocket,
  Check,
  ChevronLeft,
  Loader2,
  Save,
  Globe,
  Lock,
  Building2,
  HelpCircle,
  ClipboardCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";
import {
  createCourse,
  updateCourse,
  getCourseById,
} from "@/modules/courses/services/course.service";
import { publishCourseCurriculum } from "@/modules/courses/services/curriculum.service";
import { courseKeys, useCourseCurriculum, useCategories } from "@/modules/courses/hooks/useCourses";
import { Step1BasicInfo } from "@/modules/courses/components/wizard/Step1BasicInfo";
import { Step2Media } from "@/modules/courses/components/wizard/Step2Media";
import { CurriculumEditor } from "@/modules/courses/components/curriculum/CurriculumEditor";
import { QuizCreator } from "@/modules/courses/components/quiz/QuizCreator";
import type {
  CreateCoursePayload,
  LmsCourse,
  LmsModule,
  LmsLesson,
  LmsCourseStatus,
} from "@/types";

// ── Wizard Step definitions ───────────────────────────────────────────────────

const STEPS = [
  { id: 1, title: "Basic Info", description: "Course details", icon: BookOpen },
  { id: 2, title: "Media", description: "Thumbnail & video", icon: Image },
  { id: 3, title: "Curriculum", description: "Modules & lessons", icon: LayoutList },
  { id: 4, title: "Content", description: "Upload files", icon: Upload },
  { id: 5, title: "Assessments", description: "Quizzes & tasks", icon: ClipboardList },
  { id: 6, title: "Publish", description: "Go live", icon: Rocket },
] as const;

type StepId = (typeof STEPS)[number]["id"];

// ── Props ─────────────────────────────────────────────────────────────────────

interface CourseWizardProps {
  courseId?: string;
  onComplete: (courseId: string) => void;
  onCancel: () => void;
}

interface WizardState {
  currentStep: StepId;
  courseId: string | null;
  isDirty: boolean;
  isSaving: boolean;
  lastSaved: Date | null;
}

/** Map DB course row to Step 1 form defaults — excludes joins and read-only columns. */
function mapCourseToCreatePayload(course: LmsCourse): Partial<CreateCoursePayload> {
  return {
    title: course.title,
    subtitle: course.subtitle ?? "",
    description: course.description ?? "",
    category_id: course.category_id ?? "",
    course_id: course.course_id ?? "",
    difficulty: course.difficulty,
    language: course.language,
    estimated_duration_mins: course.estimated_duration_mins ?? 0,
    visibility: course.visibility,
    pricing: course.pricing,
    price: course.price ?? 0,
    tags: course.tags ?? [],
    prerequisites: course.prerequisites ?? [],
    learning_outcomes: course.learning_outcomes ?? [],
  };
}

// ── Step Indicator ────────────────────────────────────────────────────────────

interface StepIndicatorProps {
  steps: typeof STEPS;
  currentStep: StepId;
  completedUpTo: StepId;
}

function StepIndicator({ steps, currentStep, completedUpTo }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-between w-full overflow-x-auto pb-1">
      {steps.map((step, idx) => {
        const isCompleted = step.id < completedUpTo;
        const isCurrent = step.id === currentStep;
        const isPast = step.id < currentStep;
        const Icon = step.icon;

        return (
          <div key={step.id} className="flex items-center flex-1 min-w-0">
            {/* Step circle + label */}
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all text-sm font-semibold",
                  isPast || isCompleted
                    ? "border-primary bg-primary text-primary-foreground"
                    : isCurrent
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground",
                )}
              >
                {isPast || isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <div className="text-center hidden sm:block">
                <p
                  className={cn(
                    "text-[10px] font-medium leading-tight whitespace-nowrap",
                    isCurrent
                      ? "text-primary"
                      : isPast
                        ? "text-foreground"
                        : "text-muted-foreground",
                  )}
                >
                  {step.title}
                </p>
                <p className="text-[9px] text-muted-foreground leading-tight hidden md:block">
                  {step.description}
                </p>
              </div>
            </div>

            {/* Connecting line (not after last step) */}
            {idx < steps.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-2 transition-colors min-w-[16px]",
                  step.id < currentStep ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Visibility badge ──────────────────────────────────────────────────────────

function VisibilityIcon({ visibility }: { visibility: string }) {
  if (visibility === "public") return <Globe className="h-3 w-3 text-green-600" />;
  if (visibility === "institutional") return <Building2 className="h-3 w-3 text-blue-600" />;
  return <Lock className="h-3 w-3 text-orange-600" />;
}

// ── Step 5: Assessments ───────────────────────────────────────────────────────

interface Step5Props {
  modules: (LmsModule & { lessons: LmsLesson[] })[];
  courseId: string;
  instituteId: string;
  userId: string;
}

function Step5Assessments({ modules, courseId, instituteId, userId }: Step5Props) {
  const [quizLessonId, setQuizLessonId] = useState<string | null>(null);

  const quizLessons = modules.flatMap((m) =>
    m.lessons.filter((l) => l.lesson_type === "quiz" || l.lesson_type === "assignment"),
  );

  if (quizLessons.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-border p-12 text-center">
        <ClipboardList className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm font-medium text-foreground">No quiz or assignment lessons</p>
        <p className="text-xs text-muted-foreground mt-1">
          Go back to Step 3 and add lessons of type "Quiz" or "Assignment" to configure assessments
          here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Configure quizzes and assignments for lessons that require assessment.
      </p>

      <div className="space-y-3">
        {modules.map((mod) => {
          const assessLessons = mod.lessons.filter(
            (l) => l.lesson_type === "quiz" || l.lesson_type === "assignment",
          );
          if (assessLessons.length === 0) return null;

          return (
            <div key={mod.id} className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/30 border-b border-border">
                <p className="text-sm font-semibold text-foreground">{mod.title}</p>
              </div>
              <div className="p-4 space-y-2">
                {assessLessons.map((lesson) => (
                  <div
                    key={lesson.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 bg-background"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {lesson.lesson_type === "quiz" ? (
                        <HelpCircle className="h-4 w-4 text-purple-600 flex-shrink-0" />
                      ) : (
                        <ClipboardCheck className="h-4 w-4 text-green-600 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{lesson.title}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {lesson.lesson_type}
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setQuizLessonId(lesson.id)}
                      className="flex-shrink-0 gap-1.5"
                    >
                      Configure
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Quiz Creator inline for selected lesson */}
      {quizLessonId && (
        <div className="rounded-xl border-2 border-primary/30 bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-foreground">
              Configuring: {quizLessons.find((l) => l.id === quizLessonId)?.title ?? "Lesson"}
            </h4>
            <Button type="button" variant="ghost" size="sm" onClick={() => setQuizLessonId(null)}>
              Close
            </Button>
          </div>
          <QuizCreator
            courseId={courseId}
            lessonId={quizLessonId}
            instituteId={instituteId}
            createdBy={userId}
            onSave={() => {
              toast.success("Quiz saved");
              setQuizLessonId(null);
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── Step 6: Publish ───────────────────────────────────────────────────────────

interface Step6Props {
  course: LmsCourse;
  modules: (LmsModule & { lessons: LmsLesson[] })[];
  onPublish: (status: LmsCourseStatus) => Promise<void>;
  isPublishing: boolean;
}

function Step6Publish({ course, modules, onPublish, isPublishing }: Step6Props) {
  const totalLessons = modules.reduce((sum, m) => sum + m.lessons.length, 0);

  const checklist = [
    {
      label: "Course title set",
      done: !!course.title,
      required: true,
    },
    {
      label: "Description added",
      done: !!course.description,
      required: false,
    },
    {
      label: "Thumbnail uploaded",
      done: !!course.thumbnail_url,
      required: false,
    },
    {
      label: "At least 1 module created",
      done: modules.length > 0,
      required: true,
    },
    {
      label: "At least 1 lesson added",
      done: totalLessons > 0,
      required: true,
    },
  ];

  const isReadyToPublish = checklist.every((c) => !c.required || c.done);

  return (
    <div className="space-y-6">
      {/* Course summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {course.thumbnail_url && (
          <div className="sm:col-span-2">
            <img
              src={course.thumbnail_url}
              alt="Course thumbnail"
              className="w-full aspect-video object-cover rounded-xl border border-border"
            />
          </div>
        )}

        <div className="sm:col-span-2 space-y-2">
          <h2 className="text-lg font-semibold text-foreground">{course.title}</h2>
          {course.subtitle && <p className="text-sm text-muted-foreground">{course.subtitle}</p>}
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="text-xs capitalize">
              {course.difficulty}
            </Badge>
            <Badge variant="outline" className="text-xs capitalize">
              {course.language}
            </Badge>
            <Badge variant="outline" className="text-xs">
              <VisibilityIcon visibility={course.visibility} />
              <span className="ml-1 capitalize">{course.visibility}</span>
            </Badge>
            <Badge variant="outline" className="text-xs capitalize">
              {course.pricing === "paid" ? `₹${course.price}` : "Free"}
            </Badge>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{modules.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Modules</p>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{totalLessons}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Lessons</p>
        </div>
      </div>

      <Separator />

      {/* Readiness checklist */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Pre-publish Checklist</h3>
        <div className="space-y-2">
          {checklist.map((item) => (
            <div
              key={item.label}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 border",
                item.done
                  ? "border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900"
                  : item.required
                    ? "border-destructive/30 bg-destructive/5"
                    : "border-border bg-background",
              )}
            >
              <div
                className={cn(
                  "h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0",
                  item.done ? "bg-green-500" : item.required ? "bg-destructive/20" : "bg-muted",
                )}
              >
                {item.done ? (
                  <Check className="h-3 w-3 text-white" />
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    {item.required ? "!" : "?"}
                  </span>
                )}
              </div>
              <span
                className={cn(
                  "text-sm",
                  item.done
                    ? "text-green-800 dark:text-green-300"
                    : item.required
                      ? "text-destructive"
                      : "text-muted-foreground",
                )}
              >
                {item.label}
              </span>
              {!item.required && !item.done && (
                <Badge variant="outline" className="ml-auto text-[10px]">
                  Optional
                </Badge>
              )}
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Publish actions */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Ready to go?</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onPublish("draft")}
            disabled={isPublishing}
            className="gap-2"
          >
            {isPublishing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save as Draft
          </Button>
          <Button
            type="button"
            onClick={() => onPublish("published")}
            disabled={isPublishing || !isReadyToPublish}
            className="gap-2 bg-green-600 hover:bg-green-700 text-white"
          >
            {isPublishing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="h-4 w-4" />
            )}
            Publish Course
          </Button>
        </div>
        {!isReadyToPublish && (
          <p className="text-xs text-destructive">
            Complete all required checklist items before publishing.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Published courses are immediately visible to enrolled students. You can always unpublish
          later from the course settings.
        </p>
      </div>
    </div>
  );
}

// ── Main Wizard Component ─────────────────────────────────────────────────────

export function CourseWizard({
  courseId: initialCourseId,
  onComplete,
  onCancel,
}: CourseWizardProps) {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? "";
  const userId = user?.id ?? "";
  const savingRef = useRef(false);

  const [state, setState] = useState<WizardState>({
    currentStep: 1,
    courseId: initialCourseId ?? null,
    isDirty: false,
    isSaving: false,
    lastSaved: null,
  });

  // Existing course data (in edit mode)
  const [existingCourse, setExistingCourse] = useState<LmsCourse | null>(null);
  const publishedCurriculumSyncRef = useRef<string | null>(null);
  const [draftStep1, setDraftStep1] = useState<Partial<CreateCoursePayload> | null>(null);

  // Curriculum query
  const { data: curriculum, refetch: refetchCurriculum } = useCourseCurriculum(state.courseId);

  useEffect(() => {
    if (!state.courseId || !existingCourse || existingCourse.status !== "published") return;
    if (publishedCurriculumSyncRef.current === state.courseId) return;

    publishedCurriculumSyncRef.current = state.courseId;
    void (async () => {
      const result = await publishCourseCurriculum(state.courseId!);
      if (!result.success) return;
      void refetchCurriculum();
    })();
  }, [state.courseId, existingCourse, refetchCurriculum]);
  const modules = curriculum?.modules ?? [];

  // Categories for Step 1
  const { data: categories = [] } = useCategories(instituteId || null);

  // Computed highest reached step for stepper completeness display
  const [highestStep, setHighestStep] = useState<StepId>(1);

  // ── Load existing course in edit mode ─────────────────────────────────────

  useEffect(() => {
    if (!initialCourseId) return;

    let cancelled = false;

    getCourseById(initialCourseId).then((res) => {
      if (cancelled) return;
      if (res.success && res.data) {
        setExistingCourse(res.data);
        setDraftStep1(mapCourseToCreatePayload(res.data));
        setHighestStep(6);
      } else {
        toast.error(res.error ?? "Failed to load course data");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [initialCourseId]);

  // ── Step navigation ───────────────────────────────────────────────────────

  const goToStep = useCallback((step: StepId) => {
    setState((s) => ({ ...s, currentStep: step }));
    setHighestStep((h) => (step > h ? step : h) as StepId);
  }, []);

  const handleNext = useCallback(() => {
    const nextStep = (state.currentStep + 1) as StepId;
    if (nextStep <= 6) goToStep(nextStep);
  }, [state.currentStep, goToStep]);

  const handleBack = useCallback(() => {
    const prevStep = (state.currentStep - 1) as StepId;
    if (prevStep >= 1) goToStep(prevStep);
  }, [state.currentStep, goToStep]);

  // ── Step 1: Save basic info ───────────────────────────────────────────────

  const invalidateCourseCaches = useCallback(
    (courseId: string) => {
      if (!instituteId) return;
      void queryClient.invalidateQueries({ queryKey: courseKeys.all(instituteId) });
      void queryClient.invalidateQueries({ queryKey: courseKeys.detail(courseId) });
      void queryClient.invalidateQueries({ queryKey: courseKeys.curriculum(courseId) });
    },
    [instituteId, queryClient],
  );

  const handleStep1Save = useCallback(
    async (data: CreateCoursePayload) => {
      if (!isSupabaseConfigured) {
        toast.error(
          "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
        );
        return;
      }
      if (!instituteId || !userId) {
        toast.error("Please sign in to create or edit courses");
        return;
      }
      if (savingRef.current) return;
      savingRef.current = true;
      setState((s) => ({ ...s, isSaving: true }));

      try {
        if (state.courseId) {
          const result = await updateCourse(state.courseId, data);
          if (!result.success || !result.data) {
            toast.error(result.error ?? "Failed to update course");
            return;
          }
          setExistingCourse(result.data);
          invalidateCourseCaches(state.courseId);
        } else {
          const result = await createCourse(data, instituteId, userId);
          if (!result.success || !result.data) {
            toast.error(result.error ?? "Failed to create course");
            return;
          }
          setExistingCourse(result.data);
          setState((s) => ({ ...s, courseId: result.data!.id }));
          invalidateCourseCaches(result.data.id);
        }

        setDraftStep1(data);
        setState((s) => ({ ...s, isDirty: false, lastSaved: new Date() }));
        toast.success("Course info saved");
        goToStep(2);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to save course");
      } finally {
        savingRef.current = false;
        setState((s) => ({ ...s, isSaving: false }));
      }
    },
    [state.courseId, instituteId, userId, goToStep, invalidateCourseCaches],
  );

  // ── Step 2: Media callbacks ───────────────────────────────────────────────

  const handleThumbnailUpload = useCallback(
    (url: string, storagePath: string) => {
      if (!state.courseId) return;
      updateCourse(state.courseId, {
        thumbnail_url: url,
        thumbnail_storage_path: storagePath,
      }).then((res) => {
        if (!res.success) {
          toast.error(res.error ?? "Failed to save thumbnail");
          return;
        }
        if (res.data) setExistingCourse(res.data);
        if (state.currentStep === 2) goToStep(3);
      });
    },
    [state.courseId, state.currentStep, goToStep],
  );

  const handleThumbnailRemove = useCallback(() => {
    if (!state.courseId) return;
    updateCourse(state.courseId, {
      thumbnail_url: null,
      thumbnail_storage_path: null,
    }).then((res) => {
      if (!res.success) {
        toast.error(res.error ?? "Failed to remove thumbnail");
        return;
      }
      if (res.data) setExistingCourse(res.data);
    });
  }, [state.courseId]);

  const handleIntroVideoSet = useCallback(
    (value: { externalUrl?: string; storagePath?: string }) => {
      if (!state.courseId) return;
      updateCourse(state.courseId, {
        intro_video_url: value.externalUrl ?? null,
        intro_video_storage_path: value.storagePath ?? null,
      }).then((res) => {
        if (!res.success) {
          toast.error(res.error ?? "Failed to save intro video");
          return;
        }
        if (res.data) setExistingCourse(res.data);
        if (state.currentStep === 2) goToStep(3);
      });
    },
    [state.courseId, state.currentStep, goToStep],
  );

  const handleIntroVideoRemove = useCallback(() => {
    if (!state.courseId) return;
    updateCourse(state.courseId, {
      intro_video_url: null,
      intro_video_storage_path: null,
    }).then((res) => {
      if (!res.success) {
        toast.error(res.error ?? "Failed to remove intro video");
        return;
      }
      if (res.data) setExistingCourse(res.data);
    });
  }, [state.courseId]);

  // ── Step 6: Publish ───────────────────────────────────────────────────────

  const handlePublish = useCallback(
    async (status: LmsCourseStatus) => {
      if (!state.courseId || savingRef.current) return;
      savingRef.current = true;
      setState((s) => ({ ...s, isSaving: true }));

      const updates: Partial<LmsCourse> = {
        status,
        ...(status === "published" ? { published_at: new Date().toISOString() } : {}),
      };

      try {
        const result = await updateCourse(state.courseId, updates);

        if (!result.success) {
          toast.error(result.error ?? "Failed to update course status");
          return;
        }

        if (result.data) setExistingCourse(result.data);

        if (status === "published") {
          const { publishCourseCurriculum } =
            await import("@/modules/courses/services/curriculum.service");
          const curriculumRes = await publishCourseCurriculum(state.courseId);
          if (!curriculumRes.success) {
            toast.warning(
              curriculumRes.error ??
                "Course published but some lessons may stay hidden until republished",
            );
          }
        }

        invalidateCourseCaches(state.courseId);
        toast.success(status === "published" ? "Course published!" : "Course saved as draft");
        onComplete(state.courseId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update course status");
      } finally {
        savingRef.current = false;
        setState((s) => ({ ...s, isSaving: false }));
      }
    },
    [state.courseId, onComplete, invalidateCourseCaches],
  );

  const handleSaveDraft = useCallback(async () => {
    if (!state.courseId || savingRef.current) return;
    savingRef.current = true;
    setState((s) => ({ ...s, isSaving: true }));

    try {
      const updates: Partial<LmsCourse> = { status: "draft" };
      if (draftStep1) {
        Object.assign(updates, draftStep1);
      }
      const res = await updateCourse(state.courseId, updates);
      if (!res.success) {
        toast.error(res.error ?? "Failed to save draft");
        return;
      }
      if (res.data) setExistingCourse(res.data);
      invalidateCourseCaches(state.courseId);
      setState((s) => ({ ...s, isDirty: false, lastSaved: new Date() }));
      toast.success("Draft saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      savingRef.current = false;
      setState((s) => ({ ...s, isSaving: false }));
    }
  }, [state.courseId, draftStep1, invalidateCourseCaches]);

  // ── Require courseId for steps > 1 ───────────────────────────────────────

  const renderNeedsCourseId = () => (
    <div className="rounded-xl border-2 border-dashed border-border p-12 text-center">
      <BookOpen className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
      <p className="text-sm font-medium text-foreground">Complete Step 1 first</p>
      <p className="text-xs text-muted-foreground mt-1">
        You need to save the basic course information before proceeding.
      </p>
      <Button
        type="button"
        onClick={() => goToStep(1)}
        className="mt-4"
        size="sm"
        variant="outline"
      >
        Go to Step 1
      </Button>
    </div>
  );

  // ── Render current step content ───────────────────────────────────────────

  const step1Defaults =
    draftStep1 ?? (existingCourse ? mapCourseToCreatePayload(existingCourse) : undefined);

  const renderStepContent = () => {
    switch (state.currentStep) {
      case 1:
        return (
          <Step1BasicInfo
            defaultValues={step1Defaults}
            onSave={handleStep1Save}
            isSaving={state.isSaving}
            categories={categories}
            onDraftChange={(data, isDirty) => {
              setDraftStep1(data);
              setState((s) => ({ ...s, isDirty }));
            }}
          />
        );

      case 2:
        if (!state.courseId) return renderNeedsCourseId();
        return (
          <Step2Media
            courseId={state.courseId}
            instituteId={instituteId}
            existingThumbnailUrl={existingCourse?.thumbnail_url}
            existingIntroVideoUrl={existingCourse?.intro_video_url}
            existingIntroVideoStoragePath={existingCourse?.intro_video_storage_path ?? null}
            onThumbnailUpload={handleThumbnailUpload}
            onThumbnailRemove={handleThumbnailRemove}
            onIntroVideoSet={handleIntroVideoSet}
            onIntroVideoRemove={handleIntroVideoRemove}
          />
        );

      case 3:
        if (!state.courseId) return renderNeedsCourseId();
        return (
          <div className="space-y-3">
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5 flex items-center gap-2">
              <LayoutList className="h-4 w-4 text-primary flex-shrink-0" />
              <p className="text-sm text-primary font-medium">
                Build your course structure — add modules and lessons
              </p>
            </div>
            <CurriculumEditor
              courseId={state.courseId}
              instituteId={instituteId}
              userId={userId}
              modules={modules}
              isCoursePublished={existingCourse?.status === "published"}
              onRefresh={() => refetchCurriculum()}
            />
          </div>
        );

      case 4:
        if (!state.courseId) return renderNeedsCourseId();
        return (
          <div className="space-y-3">
            <div className="rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900 px-4 py-2.5 flex items-center gap-2">
              <Upload className="h-4 w-4 text-orange-600 flex-shrink-0" />
              <p className="text-sm text-orange-800 dark:text-orange-300 font-medium">
                Click any lesson to open its editor and upload videos, PDFs, or text content
              </p>
            </div>
            <CurriculumEditor
              courseId={state.courseId}
              instituteId={instituteId}
              userId={userId}
              modules={modules}
              isCoursePublished={existingCourse?.status === "published"}
              onRefresh={() => refetchCurriculum()}
              openEditorOnLessonAdd
            />
          </div>
        );

      case 5:
        if (!state.courseId) return renderNeedsCourseId();
        return (
          <Step5Assessments
            modules={modules}
            courseId={state.courseId}
            instituteId={instituteId}
            userId={userId}
          />
        );

      case 6:
        if (!state.courseId || !existingCourse) return renderNeedsCourseId();
        return (
          <Step6Publish
            course={existingCourse}
            modules={modules}
            onPublish={handlePublish}
            isPublishing={state.isSaving}
          />
        );

      default:
        return null;
    }
  };

  // ── Auto-save indicator ───────────────────────────────────────────────────

  const autoSaveText = state.isDirty
    ? "Unsaved changes"
    : state.lastSaved
      ? `Saved ${state.lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : state.courseId
        ? "All changes saved"
        : "Not yet saved";

  // ── Show navigation buttons for steps other than 1 (which has its own submit) ──

  const showBottomNav = state.currentStep !== 1 && state.currentStep !== 6;

  return (
    <div className="space-y-0">
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border pb-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              {initialCourseId ? "Edit Course" : "Create New Course"}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {state.courseId ? (
                <span className="flex items-center gap-1">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      state.isDirty ? "bg-orange-400" : "bg-green-500",
                    )}
                  />
                  {autoSaveText}
                </span>
              ) : (
                "Start by filling in the basic course info"
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            {state.courseId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={state.isSaving}
                onClick={() => void handleSaveDraft()}
                className="gap-1.5"
              >
                {state.isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save Draft
              </Button>
            )}
          </div>
        </div>

        {/* Step indicator */}
        <StepIndicator steps={STEPS} currentStep={state.currentStep} completedUpTo={highestStep} />
      </div>

      {/* ── Step content card ── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              {(() => {
                const StepIcon = STEPS[state.currentStep - 1].icon;
                return <StepIcon className="h-4 w-4 text-primary" />;
              })()}
            </div>
            <div>
              <CardTitle className="text-base font-semibold">
                Step {state.currentStep}: {STEPS[state.currentStep - 1].title}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {STEPS[state.currentStep - 1].description}
              </p>
            </div>
            <Badge variant="outline" className="ml-auto text-xs">
              {state.currentStep} / {STEPS.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>{renderStepContent()}</CardContent>
      </Card>

      {/* ── Bottom navigation (for steps 2-5) ── */}
      {showBottomNav && (
        <div className="flex items-center justify-between pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={handleBack}
            disabled={state.currentStep === 1}
            className="gap-1.5"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
          <Button
            type="button"
            onClick={handleNext}
            disabled={state.currentStep === 6 || !state.courseId}
            className="gap-1.5"
          >
            Next Step
          </Button>
        </div>
      )}
    </div>
  );
}
