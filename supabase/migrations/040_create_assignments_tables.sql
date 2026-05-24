-- Migration 040: Create assignments tables
CREATE TABLE IF NOT EXISTS public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  teacher_id uuid NOT NULL,
  batch_id uuid,
  course_id uuid,
  due_date timestamp with time zone,
  pdf_url text,
  drive_link text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.assignment_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE CASCADE,
  page_number integer NOT NULL,
  canvas_json jsonb,
  preview_image bytea
);

CREATE TABLE IF NOT EXISTS public.assignment_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  status text DEFAULT 'assigned',
  submitted_at timestamp with time zone
);
