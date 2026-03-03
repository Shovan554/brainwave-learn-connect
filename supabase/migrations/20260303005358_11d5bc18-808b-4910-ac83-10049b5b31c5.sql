
-- Drop restrictive policies on courses
DROP POLICY IF EXISTS "Teachers can manage own courses" ON public.courses;
DROP POLICY IF EXISTS "Students can view enrolled courses" ON public.courses;

-- Recreate as PERMISSIVE policies
CREATE POLICY "Teachers can manage own courses"
ON public.courses
FOR ALL
TO authenticated
USING (teacher_id = auth.uid())
WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Students can view enrolled courses"
ON public.courses
FOR SELECT
TO authenticated
USING (is_enrolled(id, auth.uid()));
