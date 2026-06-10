-- Add code_snippet column to exam_questions table for programming MCQs

-- Add code_snippet column
ALTER TABLE public.exam_questions
ADD COLUMN IF NOT EXISTS code_snippet TEXT DEFAULT NULL;

-- Create index for faster queries (optional, if needed)
CREATE INDEX IF NOT EXISTS idx_exam_questions_code_snippet 
ON public.exam_questions(id) 
WHERE code_snippet IS NOT NULL;

-- Grant permissions to anon and authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_questions TO anon, authenticated;
