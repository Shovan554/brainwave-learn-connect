
CREATE TABLE public.course_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  generated_at timestamp with time zone NOT NULL DEFAULT now(),
  generated_by uuid NOT NULL,
  UNIQUE(course_id)
);

ALTER TABLE public.course_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enrolled users can view course notes"
  ON public.course_notes FOR SELECT TO authenticated
  USING (is_enrolled(course_id, auth.uid()) OR is_course_teacher(course_id, auth.uid()));

CREATE POLICY "Teachers can manage course notes"
  ON public.course_notes FOR ALL TO authenticated
  USING (is_course_teacher(course_id, auth.uid()))
  WITH CHECK (is_course_teacher(course_id, auth.uid()));
