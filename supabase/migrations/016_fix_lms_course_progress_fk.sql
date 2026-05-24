-- Drop the existing constraint
ALTER TABLE public.lms_course_progress 
  DROP CONSTRAINT IF EXISTS lms_course_progress_last_lesson_id_fkey;

-- Re-add it with ON DELETE SET NULL
ALTER TABLE public.lms_course_progress
  ADD CONSTRAINT lms_course_progress_last_lesson_id_fkey 
  FOREIGN KEY (last_lesson_id) 
  REFERENCES public.lms_lessons(id) 
  ON DELETE SET NULL;
