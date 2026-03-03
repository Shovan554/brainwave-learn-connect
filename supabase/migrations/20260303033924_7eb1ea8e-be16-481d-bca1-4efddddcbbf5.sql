
CREATE TABLE public.saved_summaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  course_id UUID NOT NULL,
  course_title TEXT NOT NULL DEFAULT '',
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.saved_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own summaries"
ON public.saved_summaries FOR SELECT
USING (student_id = auth.uid());

CREATE POLICY "Students can insert own summaries"
ON public.saved_summaries FOR INSERT
WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can delete own summaries"
ON public.saved_summaries FOR DELETE
USING (student_id = auth.uid());

CREATE INDEX idx_saved_summaries_student ON public.saved_summaries(student_id);
CREATE UNIQUE INDEX idx_saved_summaries_unique ON public.saved_summaries(student_id, file_url);
