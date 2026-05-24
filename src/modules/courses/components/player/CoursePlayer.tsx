// ---------------------------------------------------------------------------
// CoursePlayer — main two-panel course player layout (Udemy / Coursera style)
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  StickyNote,
  Package,
  AlertCircle,
  FileText,
  Clock,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { PlayerHeader } from "./PlayerHeader";
import { PlayerSidebar } from "./PlayerSidebar";
import { VideoPlayer } from "./VideoPlayer";
import { ResourcesPanel } from "./ResourcesPanel";
import { AssignmentPanel } from "./AssignmentPanel";
import { QuizPlayer } from "@/modules/courses/components/quiz/QuizPlayer";
import { useCourseProgress } from "@/modules/courses/hooks/useProgress";
import { useLessonContent } from "@/modules/courses/hooks/useLessonContent";
import { resolveLessonPdfUrl } from "@/modules/courses/services/lesson-content.service";

import type {
  LmsCourseWithCurriculum,
  LmsEnrollment,
  LmsLesson,
  LmsLessonProgress,
  LmsQuiz,
  LmsQuizAttempt,
} from "@/types";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CoursePlayerProps {
  course: LmsCourseWithCurriculum;
  enrollment: LmsEnrollment;
  initialLessonId?: string;
  progressMap: Record<string, LmsLessonProgress>;
  onProgressUpdate: (lessonId: string, data: Partial<LmsLessonProgress>) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Flatten all lessons across modules into an ordered array */
function flattenLessons(course: LmsCourseWithCurriculum): LmsLesson[] {
  return course.modules.flatMap((m) => m.lessons ?? []);
}

/** Find the first lesson that has not been completed */
function findFirstIncomplete(
  lessons: LmsLesson[],
  progressMap: Record<string, LmsLessonProgress>,
): LmsLesson | null {
  return lessons.find((l) => !progressMap[l.id]?.is_completed) ?? lessons[0] ?? null;
}

// ── TextContent sub-component ─────────────────────────────────────────────────

function TextContent({
  lesson,
  content,
  description,
  onComplete,
}: {
  lesson: LmsLesson;
  content: string | null;
  description: string | null;
  onComplete: () => void;
}) {
  const body = content?.trim() || description?.trim() || "";

  useEffect(() => {
    // Auto-mark text lessons complete after 5 seconds of viewing
    const timer = setTimeout(() => {
      onComplete();
    }, 5000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!body) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
        <AlertCircle className="size-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No text content for this lesson yet.</p>
      </div>
    );
  }

  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(body);

  return (
    <div className="flex flex-col w-full bg-background min-h-full">
      <div className="flex items-center justify-between border-b border-border/40 bg-background/95 backdrop-blur-xl px-4 md:px-8 py-4 sticky top-0 z-10 shadow-sm transition-all">
        <div className="flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner border border-primary/20">
            <BookOpen className="size-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary/80 bg-primary/5 px-2 py-0.5 rounded-full border border-primary/10">
                Lesson {lesson.position}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                • Article
              </span>
            </div>
            <p className="text-lg font-bold leading-tight text-foreground tracking-tight">
              {lesson.title}
            </p>
          </div>
        </div>

        <Button
          variant="default"
          size="lg"
          onClick={onComplete}
          className="rounded-full px-8 shadow-lg hover:shadow-primary/20 transition-all font-bold h-12 bg-primary hover:-translate-y-0.5"
        >
          Mark as Complete
        </Button>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-16 md:py-24">
        {looksLikeHtml ? (
          <div
            className="prose prose-lg dark:prose-invert max-w-none text-foreground/90 prose-headings:font-bold prose-headings:tracking-tight prose-a:text-primary hover:prose-a:text-primary/80 prose-img:rounded-2xl prose-img:border prose-img:shadow-xl"
            dangerouslySetInnerHTML={{ __html: body }}
          />
        ) : (
          <div className="prose prose-lg dark:prose-invert max-w-none">
            <pre className="whitespace-pre-wrap font-sans text-[17px] leading-relaxed text-foreground/80 bg-muted/30 p-8 rounded-3xl border border-border/40 shadow-sm">
              {body}
            </pre>
          </div>
        )}
        <div className="mt-20 flex flex-col items-center justify-center border-t border-border/40 pt-12">
          <Button
            onClick={onComplete}
            size="lg"
            className="rounded-full px-10 h-14 text-base font-semibold shadow-lg hover:-translate-y-1 transition-all duration-300"
          >
            Complete Article
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── PdfViewer sub-component ───────────────────────────────────────────────────

function PdfViewer({ lesson, onComplete }: { lesson: LmsLesson; onComplete: () => void }) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPdfUrl(null);

    void resolveLessonPdfUrl(lesson, lesson.materials).then((res) => {
      if (cancelled) return;
      if (res.success && res.data) {
        let url = res.data;
        // Fix Google Drive URLs for iframe embedding
        if (url.includes("drive.google.com/file/d/")) {
          url = url.replace(/\/view.*$/, "/preview");
        }
        setPdfUrl(url);
        setError(null);
      } else {
        setPdfUrl(null);
        setError(res.error ?? "Failed to load PDF.");
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [lesson.id, lesson.video_url, lesson.video_storage_path, lesson.materials]);

  // Auto-mark complete after 10 seconds of viewing PDF
  useEffect(() => {
    if (!pdfUrl) return;
    const timer = setTimeout(() => {
      onComplete();
    }, 10000);
    return () => clearTimeout(timer);
  }, [pdfUrl, onComplete]);

  if (loading) {
    return (
      <div className="flex h-full min-h-96 items-center justify-center">
        <div className="size-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error || !pdfUrl) {
    return (
      <div className="flex h-full min-h-96 flex-col items-center justify-center gap-3 text-center">
        <AlertCircle className="size-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">{error ?? "PDF unavailable."}</p>
      </div>
    );
  }

  const displayTitle =
    lesson.title?.toLowerCase() === "pdf" ? "Course Documentation" : lesson.title;

  return (
    <div className="flex flex-col h-[85vh] w-full bg-background relative group">
      <div className="flex items-center justify-between border-b border-border/40 bg-background/95 backdrop-blur-xl px-4 md:px-8 py-4 sticky top-0 z-10 shadow-sm transition-all">
        <div className="flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner border border-primary/20">
            <FileText className="size-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary/80 bg-primary/5 px-2 py-0.5 rounded-full border border-primary/10">
                Lesson {lesson.position}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                • PDF Guide
              </span>
            </div>
            <p className="text-lg font-bold leading-tight text-foreground tracking-tight">
              {displayTitle}
            </p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-8 mr-8 text-muted-foreground">
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
              <Clock className="size-3.5 text-primary/60" />
              <span>Read Time</span>
            </div>
            <span className="text-xs font-medium text-foreground/70">~15 mins</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
              <BookOpen className="size-3.5 text-primary/60" />
              <span>Resources</span>
            </div>
            <span className="text-xs font-medium text-foreground/70">1 Material</span>
          </div>
        </div>

        <Button
          variant="default"
          size="lg"
          onClick={onComplete}
          className="rounded-full px-8 shadow-lg hover:shadow-primary/20 transition-all font-bold h-12 bg-primary hover:-translate-y-0.5"
        >
          Mark as Complete
        </Button>
      </div>
      <div className="flex-1 w-full bg-muted/20 flex flex-col items-center p-0 md:p-6 overflow-hidden">
        <iframe
          src={pdfUrl}
          title={lesson.title}
          className="w-full h-full max-w-6xl rounded-none md:rounded-2xl border-0 md:border border-border/40 shadow-2xl bg-black"
          allow="autoplay"
          allowFullScreen
          aria-label={`PDF: ${lesson.title}`}
        />
      </div>
    </div>
  );
}

// ── CoursePlayer ──────────────────────────────────────────────────────────────

export function CoursePlayer({
  course,
  enrollment,
  initialLessonId,
  progressMap,
  onProgressUpdate,
}: CoursePlayerProps) {
  const navigate = useNavigate();

  const allLessons = flattenLessons(course);
  const hasCurriculum = allLessons.length > 0;

  // ── Core state ────────────────────────────────────────────────────────────

  const [currentLesson, setCurrentLesson] = useState<LmsLesson | null>(() => {
    if (initialLessonId) {
      const found = allLessons.find((l) => l.id === initialLessonId);
      if (found) return found;
    }
    return findFirstIncomplete(allLessons, progressMap);
  });

  // Auto-select first lesson when curriculum loads after mount
  useEffect(() => {
    if (currentLesson || allLessons.length === 0) return;
    setCurrentLesson(findFirstIncomplete(allLessons, progressMap));
  }, [allLessons, currentLesson, progressMap]);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<"notes" | "resources">("notes");

  const {
    lesson: activeLesson,
    materialsLoading,
    quiz: currentQuiz,
    quizLoading,
    quizError,
  } = useLessonContent(currentLesson);

  // Notes are persisted in localStorage per lesson
  const [note, setNote] = useState<string>("");
  const noteKey = `eduos-note-${enrollment.id}-${currentLesson?.id ?? ""}`;

  // Ref to track previous lesson id for "mark accessed" on switch
  const prevLessonIdRef = useRef<string | null>(null);

  // ── Derived ───────────────────────────────────────────────────────────────

  const { data: courseProgress } = useCourseProgress(enrollment.id);
  const completionPct = courseProgress?.completion_pct ?? 0;

  const currentLessonIndex = currentLesson
    ? allLessons.findIndex((l) => l.id === currentLesson.id)
    : -1;
  const prevLesson = currentLessonIndex > 0 ? allLessons[currentLessonIndex - 1] : null;
  const nextLesson =
    currentLessonIndex >= 0 && currentLessonIndex < allLessons.length - 1
      ? allLessons[currentLessonIndex + 1]
      : null;

  // ── Load note from localStorage when lesson changes ───────────────────────

  useEffect(() => {
    if (!currentLesson) return;
    const saved = localStorage.getItem(noteKey) ?? "";
    setNote(saved);
  }, [noteKey, currentLesson?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save note to localStorage on change ──────────────────────────────────

  useEffect(() => {
    if (!currentLesson) return;
    const timeout = setTimeout(() => {
      localStorage.setItem(noteKey, note);
    }, 500);
    return () => clearTimeout(timeout);
  }, [note, noteKey, currentLesson?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mark previous lesson as accessed when switching ───────────────────────

  useEffect(() => {
    const prevId = prevLessonIdRef.current;
    if (prevId && currentLesson?.id !== prevId) {
      onProgressUpdate(prevId, { last_accessed_at: new Date().toISOString() });
    }
    prevLessonIdRef.current = currentLesson?.id ?? null;
  }, [currentLesson?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Lesson selection ──────────────────────────────────────────────────────

  const handleLessonSelect = useCallback(
    (lesson: LmsLesson) => {
      setCurrentLesson(lesson);
      setActiveTab("notes");
      void navigate({
        to: "/dashboard/student/learn/$courseId",
        params: { courseId: course.id },
        search: { lessonId: lesson.id },
        replace: true,
      });
    },
    [navigate, course.id],
  );

  // ── Video progress ────────────────────────────────────────────────────────

  const handleVideoProgress = useCallback(
    (watchedSeconds: number, currentPosition: number) => {
      if (!currentLesson) return;
      onProgressUpdate(currentLesson.id, {
        watch_seconds: watchedSeconds,
        last_position_secs: currentPosition,
      });
    },
    [currentLesson, onProgressUpdate],
  );

  // ── Lesson complete ───────────────────────────────────────────────────────

  const handleLessonComplete = useCallback(() => {
    if (!currentLesson) return;
    const wasComplete = progressMap[currentLesson.id]?.is_completed;
    if (!wasComplete) {
      onProgressUpdate(currentLesson.id, { is_completed: true });
      toast.success("Lesson completed!", { duration: 2500 });
    }
  }, [currentLesson, progressMap, onProgressUpdate]);

  // ── Quiz complete ─────────────────────────────────────────────────────────

  const handleQuizComplete = useCallback(
    (_attempt: LmsQuizAttempt) => {
      handleLessonComplete();
    },
    [handleLessonComplete],
  );

  // ── Back navigation ───────────────────────────────────────────────────────

  const handleBack = useCallback(() => {
    void navigate({ to: "/dashboard/student/my-learning" });
  }, [navigate]);

  // ── Render content based on lesson type ──────────────────────────────────

  const renderContent = () => {
    const lesson = activeLesson ?? currentLesson;

    if (
      materialsLoading &&
      lesson &&
      (lesson.lesson_type === "pdf" || lesson.lesson_type === "video")
    ) {
      return (
        <div className="flex min-h-96 flex-1 items-center justify-center">
          <div className="size-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      );
    }

    if (!currentLesson) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <AlertCircle className="size-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">
            {hasCurriculum ? "Select a lesson to begin" : "No lessons in this course yet"}
          </p>
          <p className="max-w-md text-xs text-muted-foreground">
            {hasCurriculum
              ? "Choose a lesson from the course content panel on the right."
              : "Your instructor has not published lesson content yet. Check back later or contact your institute."}
          </p>
        </div>
      );
    }

    switch (lesson!.lesson_type) {
      case "video":
        return (
          <VideoPlayer
            lesson={lesson!}
            enrollment={enrollment}
            savedPosition={progressMap[lesson!.id]?.last_position_secs ?? 0}
            onProgress={handleVideoProgress}
            onComplete={handleLessonComplete}
            instituteId={enrollment.institute_id}
          />
        );

      case "pdf":
        return <PdfViewer lesson={lesson!} onComplete={handleLessonComplete} />;

      case "text":
        return (
          <TextContent
            lesson={lesson!}
            content={lesson!.content}
            description={lesson!.description}
            onComplete={handleLessonComplete}
          />
        );

      case "quiz":
        if (quizLoading) {
          return (
            <div className="flex flex-1 flex-col gap-4 p-6">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-10 w-32" />
            </div>
          );
        }
        if (!currentQuiz) {
          return (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              <AlertCircle className="size-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                {quizError ?? "Quiz not available. Your instructor may still be setting it up."}
              </p>
            </div>
          );
        }
        return (
          <QuizPlayer
            quiz={currentQuiz}
            enrollment={enrollment}
            studentId={enrollment.student_id}
            instituteId={enrollment.institute_id}
            onComplete={handleQuizComplete}
          />
        );

      case "assignment":
        return (
          <AssignmentPanel
            lesson={lesson!}
            enrollment={enrollment}
            studentId={enrollment.student_id}
            instituteId={enrollment.institute_id}
            onComplete={handleLessonComplete}
          />
        );

      case "live":
        return (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center">
            <AlertCircle className="size-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              This is a live session. Join via the provided meeting link.
            </p>
            {lesson!.video_url && (
              <a
                href={lesson!.video_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary hover:underline"
              >
                Join Live Session
              </a>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-background">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <PlayerHeader
        course={course}
        currentLesson={currentLesson}
        completionPct={completionPct}
        onBack={handleBack}
      />

      {/* ── Body: sidebar + main content ────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 overflow-hidden bg-muted/10">
        {/* ── Sidebar (Left Side) ────────────────────────────────────────── */}
        <PlayerSidebar
          modules={course.modules}
          currentLessonId={currentLesson?.id ?? ""}
          progressMap={progressMap}
          onLessonSelect={handleLessonSelect}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((c) => !c)}
          courseProgress={courseProgress ?? null}
        />

        {/* Main content column */}
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto relative bg-background rounded-tl-2xl shadow-[-10px_0_30px_-15px_rgba(0,0,0,0.1)] border-l border-border/50">
          {/* Video / PDF / Text / Quiz / Assignment */}
          <div className="shrink-0 relative overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentLesson?.id ?? "empty"}
                initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
              >
                {renderContent()}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="mx-auto w-full max-w-5xl px-4 md:px-8 py-8">
            {/* ── LessonNavBar ─────────────────────────────────────────────── */}
            <div className="flex items-center justify-between bg-card rounded-2xl border border-border/40 px-6 py-4 shadow-xl mb-8">
              <Button
                variant="ghost"
                size="default"
                onClick={() => prevLesson && handleLessonSelect(prevLesson)}
                disabled={!prevLesson}
                className="gap-2 rounded-full px-5 hover:bg-muted transition-colors font-medium"
              >
                <ChevronLeft className="size-4" />
                <span className="hidden sm:inline">Previous Lesson</span>
              </Button>

              <div className="flex-1 px-6 text-center">
                {currentLesson && (
                  <p className="truncate text-[13px] font-bold tracking-wide uppercase text-muted-foreground">
                    {currentLesson.title}
                  </p>
                )}
              </div>

              <Button
                size="default"
                onClick={() => nextLesson && handleLessonSelect(nextLesson)}
                disabled={!nextLesson}
                className="gap-2 rounded-full px-6 shadow-md hover:shadow-lg transition-all font-medium"
              >
                <span className="hidden sm:inline">Next Lesson</span>
                <ChevronRight className="size-4" />
              </Button>
            </div>

            {/* ── Notes / Resources tabs ───────────────────────────────────── */}
            <div className="bg-card rounded-3xl border border-border/40 shadow-sm overflow-hidden">
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as "notes" | "resources")}
              >
                <div className="border-b border-border/40 bg-muted/10 px-6 pt-4 pb-0">
                  <TabsList className="mb-0 h-auto bg-transparent p-0 flex gap-6 w-full justify-start rounded-none border-0">
                    <TabsTrigger
                      value="notes"
                      className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 pb-4 pt-2 font-semibold text-muted-foreground data-[state=active]:text-foreground transition-all"
                    >
                      <StickyNote className="size-4" />
                      Personal Notes
                    </TabsTrigger>
                    <TabsTrigger
                      value="resources"
                      className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 pb-4 pt-2 font-semibold text-muted-foreground data-[state=active]:text-foreground transition-all"
                    >
                      <Package className="size-4" />
                      Downloads & Resources
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="p-6 md:p-8 min-h-64">
                  {/* Notes */}
                  <TabsContent
                    value="notes"
                    className="animate-in fade-in slide-in-from-bottom-2 duration-300 mt-0"
                  >
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground/80 font-medium">
                        Notes are saved automatically to your browser.
                      </p>
                      <Textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Type your notes for this lesson here..."
                        className="min-h-40 resize-y text-base rounded-2xl border-border/40 bg-muted/10 p-5 focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-primary shadow-inner transition-all"
                      />
                    </div>
                  </TabsContent>

                  {/* Resources */}
                  <TabsContent
                    value="resources"
                    className="animate-in fade-in slide-in-from-bottom-2 duration-300 mt-0"
                  >
                    {activeLesson || currentLesson || allLessons[0] ? (
                      <ResourcesPanel
                        lesson={activeLesson ?? currentLesson ?? allLessons[0]!}
                        materials={activeLesson?.materials ?? currentLesson?.materials ?? []}
                        instituteId={enrollment.institute_id}
                      />
                    ) : (
                      <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
                        <Package className="size-10 text-muted-foreground/30" />
                        <p className="text-sm font-medium text-muted-foreground">
                          No resources available for this lesson.
                        </p>
                      </div>
                    )}
                  </TabsContent>
                </div>
              </Tabs>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
