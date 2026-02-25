
-- Create assignment submissions table
CREATE TABLE public.assignment_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  file_url TEXT,
  file_name TEXT,
  text_content TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  grade NUMERIC,
  feedback TEXT,
  graded_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(assignment_id, student_id)
);

ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;

-- Students can view and submit their own submissions
CREATE POLICY "Students can view own submissions" ON public.assignment_submissions FOR SELECT
  USING (student_id = auth.uid());

CREATE POLICY "Students can insert own submissions" ON public.assignment_submissions FOR INSERT
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can update own submissions" ON public.assignment_submissions FOR UPDATE
  USING (student_id = auth.uid());

-- Teachers can view and grade submissions for their courses
CREATE POLICY "Teachers can view course submissions" ON public.assignment_submissions FOR SELECT
  USING (public.is_course_teacher(public.get_assignment_course_id(assignment_id), auth.uid()));

CREATE POLICY "Teachers can grade submissions" ON public.assignment_submissions FOR UPDATE
  USING (public.is_course_teacher(public.get_assignment_course_id(assignment_id), auth.uid()));
