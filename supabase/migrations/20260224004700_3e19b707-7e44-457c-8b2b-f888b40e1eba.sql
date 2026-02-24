
-- Drop all problematic policies that create circular dependencies
DROP POLICY IF EXISTS "Students can view enrolled courses" ON public.courses;
DROP POLICY IF EXISTS "Teachers can manage own courses" ON public.courses;
DROP POLICY IF EXISTS "Students can view own enrollments" ON public.enrollments;
DROP POLICY IF EXISTS "Students can enroll themselves" ON public.enrollments;
DROP POLICY IF EXISTS "Students can unenroll themselves" ON public.enrollments;
DROP POLICY IF EXISTS "Teachers can view enrollments for own courses" ON public.enrollments;
DROP POLICY IF EXISTS "Students can view published assignments" ON public.assignments;
DROP POLICY IF EXISTS "Teachers can manage assignments" ON public.assignments;
DROP POLICY IF EXISTS "Students can view course files" ON public.course_files;
DROP POLICY IF EXISTS "Teachers can manage course files" ON public.course_files;
DROP POLICY IF EXISTS "Students can view published weekly content" ON public.weekly_content;
DROP POLICY IF EXISTS "Teachers can manage weekly content" ON public.weekly_content;
DROP POLICY IF EXISTS "Students can view published assignment assets" ON public.assignment_assets;
DROP POLICY IF EXISTS "Teachers can manage assignment assets" ON public.assignment_assets;
DROP POLICY IF EXISTS "Students can view published wc assets" ON public.weekly_content_assets;
DROP POLICY IF EXISTS "Teachers can manage wc assets" ON public.weekly_content_assets;
DROP POLICY IF EXISTS "Reporters can view own reports" ON public.content_reports;
DROP POLICY IF EXISTS "Teachers can view reports for own courses" ON public.content_reports;
DROP POLICY IF EXISTS "Users can create reports" ON public.content_reports;
DROP POLICY IF EXISTS "Users can manage own AI chats" ON public.ai_chats;
DROP POLICY IF EXISTS "Anyone authenticated can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own role" ON public.user_roles;
DROP POLICY IF EXISTS "Anyone authenticated can view portfolios" ON public.project_portfolios;
DROP POLICY IF EXISTS "Students can insert own portfolios" ON public.project_portfolios;
DROP POLICY IF EXISTS "Students can update own portfolios" ON public.project_portfolios;
DROP POLICY IF EXISTS "Students can delete own portfolios" ON public.project_portfolios;

-- Create security definer helper functions to break recursion

-- Check if user is teacher of a course (without triggering courses RLS)
CREATE OR REPLACE FUNCTION public.is_course_teacher(_course_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.courses WHERE id = _course_id AND teacher_id = _user_id
  );
$$;

-- Check if student is enrolled in a course (without triggering enrollments RLS)
CREATE OR REPLACE FUNCTION public.is_enrolled(_course_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.enrollments WHERE course_id = _course_id AND student_id = _user_id
  );
$$;

-- Recreate all policies as PERMISSIVE using helper functions

-- courses
CREATE POLICY "Teachers can manage own courses" ON public.courses FOR ALL
  USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Students can view enrolled courses" ON public.courses FOR SELECT
  USING (public.is_enrolled(id, auth.uid()));

-- enrollments
CREATE POLICY "Students can view own enrollments" ON public.enrollments FOR SELECT
  USING (student_id = auth.uid());

CREATE POLICY "Students can enroll themselves" ON public.enrollments FOR INSERT
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can unenroll themselves" ON public.enrollments FOR DELETE
  USING (student_id = auth.uid());

CREATE POLICY "Teachers can view enrollments for own courses" ON public.enrollments FOR SELECT
  USING (public.is_course_teacher(course_id, auth.uid()));

-- assignments
CREATE POLICY "Teachers can manage assignments" ON public.assignments FOR ALL
  USING (public.is_course_teacher(course_id, auth.uid()))
  WITH CHECK (public.is_course_teacher(course_id, auth.uid()));

CREATE POLICY "Students can view published assignments" ON public.assignments FOR SELECT
  USING (is_published = true AND public.is_enrolled(course_id, auth.uid()));

-- course_files
CREATE POLICY "Teachers can manage course files" ON public.course_files FOR ALL
  USING (public.is_course_teacher(course_id, auth.uid()))
  WITH CHECK (public.is_course_teacher(course_id, auth.uid()));

CREATE POLICY "Students can view course files" ON public.course_files FOR SELECT
  USING (public.is_enrolled(course_id, auth.uid()));

-- weekly_content
CREATE POLICY "Teachers can manage weekly content" ON public.weekly_content FOR ALL
  USING (public.is_course_teacher(course_id, auth.uid()))
  WITH CHECK (public.is_course_teacher(course_id, auth.uid()));

CREATE POLICY "Students can view published weekly content" ON public.weekly_content FOR SELECT
  USING (is_published = true AND public.is_enrolled(course_id, auth.uid()));

-- assignment_assets (need to look up course_id via assignments)
CREATE OR REPLACE FUNCTION public.get_assignment_course_id(_assignment_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT course_id FROM public.assignments WHERE id = _assignment_id;
$$;

CREATE POLICY "Teachers can manage assignment assets" ON public.assignment_assets FOR ALL
  USING (public.is_course_teacher(public.get_assignment_course_id(assignment_id), auth.uid()))
  WITH CHECK (public.is_course_teacher(public.get_assignment_course_id(assignment_id), auth.uid()));

CREATE POLICY "Students can view published assignment assets" ON public.assignment_assets FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.assignments a
    WHERE a.id = assignment_assets.assignment_id AND a.is_published = true
    AND public.is_enrolled(a.course_id, auth.uid())
  ));

-- weekly_content_assets
CREATE OR REPLACE FUNCTION public.get_wc_course_id(_wc_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT course_id FROM public.weekly_content WHERE id = _wc_id;
$$;

CREATE POLICY "Teachers can manage wc assets" ON public.weekly_content_assets FOR ALL
  USING (public.is_course_teacher(public.get_wc_course_id(weekly_content_id), auth.uid()))
  WITH CHECK (public.is_course_teacher(public.get_wc_course_id(weekly_content_id), auth.uid()));

CREATE POLICY "Students can view published wc assets" ON public.weekly_content_assets FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.weekly_content wc
    WHERE wc.id = weekly_content_assets.weekly_content_id AND wc.is_published = true
    AND public.is_enrolled(wc.course_id, auth.uid())
  ));

-- content_reports
CREATE POLICY "Users can create reports" ON public.content_reports FOR INSERT
  WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "Reporters can view own reports" ON public.content_reports FOR SELECT
  USING (reporter_id = auth.uid());

CREATE POLICY "Teachers can view reports for own courses" ON public.content_reports FOR SELECT
  USING (public.is_course_teacher(course_id, auth.uid()));

-- ai_chats
CREATE POLICY "Users can manage own AI chats" ON public.ai_chats FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- profiles
CREATE POLICY "Anyone authenticated can view profiles" ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE
  USING (user_id = auth.uid());

-- user_roles
CREATE POLICY "Users can read own role" ON public.user_roles FOR SELECT
  USING (user_id = auth.uid());

-- project_portfolios
CREATE POLICY "Anyone authenticated can view portfolios" ON public.project_portfolios FOR SELECT
  USING (true);

CREATE POLICY "Students can insert own portfolios" ON public.project_portfolios FOR INSERT
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "Students can update own portfolios" ON public.project_portfolios FOR UPDATE
  USING (student_id = auth.uid());

CREATE POLICY "Students can delete own portfolios" ON public.project_portfolios FOR DELETE
  USING (student_id = auth.uid());
