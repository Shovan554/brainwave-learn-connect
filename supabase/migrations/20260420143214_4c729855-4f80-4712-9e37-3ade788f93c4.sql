-- Co-teachers join table
CREATE TABLE public.course_teachers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  added_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (course_id, teacher_id)
);

CREATE INDEX idx_course_teachers_course ON public.course_teachers(course_id);
CREATE INDEX idx_course_teachers_teacher ON public.course_teachers(teacher_id);

ALTER TABLE public.course_teachers ENABLE ROW LEVEL SECURITY;

-- Update helper to recognize both the primary teacher and co-teachers
CREATE OR REPLACE FUNCTION public.is_course_teacher(_course_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.courses WHERE id = _course_id AND teacher_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.course_teachers WHERE course_id = _course_id AND teacher_id = _user_id
  );
$function$;

-- RLS for course_teachers
CREATE POLICY "Teachers can view co-teachers of their courses"
ON public.course_teachers FOR SELECT
USING (public.is_course_teacher(course_id, auth.uid()));

CREATE POLICY "Enrolled students can view co-teachers"
ON public.course_teachers FOR SELECT
USING (public.is_enrolled(course_id, auth.uid()));

CREATE POLICY "Teachers can add co-teachers"
ON public.course_teachers FOR INSERT
WITH CHECK (public.is_course_teacher(course_id, auth.uid()) AND public.has_role(teacher_id, 'teacher'::app_role));

CREATE POLICY "Teachers can remove co-teachers"
ON public.course_teachers FOR DELETE
USING (public.is_course_teacher(course_id, auth.uid()));

-- Allow co-teachers to also see the course row (primary teacher already covered)
CREATE POLICY "Co-teachers can view course"
ON public.courses FOR SELECT
USING (EXISTS (SELECT 1 FROM public.course_teachers ct WHERE ct.course_id = courses.id AND ct.teacher_id = auth.uid()));