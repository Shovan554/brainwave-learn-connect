
-- Drop all existing restrictive policies on assignment_submissions
DROP POLICY IF EXISTS "Students can view own submissions" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Students can insert own submissions" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Students can update own submissions" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Teachers can view course submissions" ON public.assignment_submissions;
DROP POLICY IF EXISTS "Teachers can grade submissions" ON public.assignment_submissions;

-- Recreate as PERMISSIVE policies
CREATE POLICY "Students can view own submissions"
  ON public.assignment_submissions FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Students can insert own submissions"
  ON public.assignment_submissions FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can update own submissions"
  ON public.assignment_submissions FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid());

CREATE POLICY "Teachers can view course submissions"
  ON public.assignment_submissions FOR SELECT
  TO authenticated
  USING (is_course_teacher(get_assignment_course_id(assignment_id), auth.uid()));

CREATE POLICY "Teachers can grade submissions"
  ON public.assignment_submissions FOR UPDATE
  TO authenticated
  USING (is_course_teacher(get_assignment_course_id(assignment_id), auth.uid()));
