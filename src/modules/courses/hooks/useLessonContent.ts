// ---------------------------------------------------------------------------
// useLessonContent — hydrate lesson materials + quiz for the player
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { hydrateLessonWithMaterials } from "@/modules/courses/services/lesson-content.service";
import { getQuizByLesson } from "@/modules/courses/services/quiz.service";
import type { LmsLesson, LmsQuiz } from "@/types";

export function useLessonContent(lesson: LmsLesson | null) {
  const [hydratedLesson, setHydratedLesson] = useState<LmsLesson | null>(lesson);
  const [materialsLoading, setMaterialsLoading] = useState(false);

  const [quiz, setQuiz] = useState<LmsQuiz | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);

  useEffect(() => {
    setHydratedLesson(lesson);
    if (!lesson) return;

    let cancelled = false;
    setMaterialsLoading(true);

    void hydrateLessonWithMaterials(lesson).then((next) => {
      if (!cancelled) {
        setHydratedLesson(next);
        setMaterialsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    lesson?.id,
    lesson?.lesson_type,
    lesson?.video_url,
    lesson?.video_storage_path,
    lesson?.content,
  ]);

  useEffect(() => {
    if (!lesson || lesson.lesson_type !== "quiz") {
      setQuiz(null);
      setQuizError(null);
      setQuizLoading(false);
      return;
    }

    let cancelled = false;
    setQuizLoading(true);
    setQuizError(null);
    setQuiz(null);

    void getQuizByLesson(lesson.id).then((res) => {
      if (cancelled) return;
      if (res.success && res.data) {
        setQuiz(res.data);
        setQuizError(null);
      } else {
        setQuiz(null);
        setQuizError(res.error ?? "Quiz not available for this lesson.");
      }
      setQuizLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [lesson?.id, lesson?.lesson_type]);

  return {
    lesson: hydratedLesson,
    materialsLoading,
    quiz,
    quizLoading,
    quizError,
  };
}
