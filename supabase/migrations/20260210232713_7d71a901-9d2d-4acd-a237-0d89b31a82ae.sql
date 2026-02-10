
-- Role enum
CREATE TYPE public.app_role AS ENUM ('teacher', 'student');

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users can read own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  bio TEXT DEFAULT '',
  major TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Auto-create profile + role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', ''));
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, (COALESCE(NEW.raw_user_meta_data->>'role', 'student'))::app_role);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Courses table (no enrollment policy yet)
CREATE TABLE public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL,
  title TEXT NOT NULL,
  term TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  invite_code TEXT NOT NULL UNIQUE DEFAULT substr(md5(random()::text), 1, 8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can manage own courses" ON public.courses FOR ALL TO authenticated
  USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());

CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enrollments (must exist before courses enrollment policy)
CREATE TABLE public.enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  student_id UUID NOT NULL,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (course_id, student_id)
);
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view enrollments for own courses" ON public.enrollments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.teacher_id = auth.uid()));
CREATE POLICY "Students can view own enrollments" ON public.enrollments FOR SELECT TO authenticated USING (student_id = auth.uid());
CREATE POLICY "Students can enroll themselves" ON public.enrollments FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid());
CREATE POLICY "Students can unenroll themselves" ON public.enrollments FOR DELETE TO authenticated USING (student_id = auth.uid());

-- NOW add courses enrollment policy
CREATE POLICY "Students can view enrolled courses" ON public.courses FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.enrollments e WHERE e.course_id = id AND e.student_id = auth.uid()));

-- Weekly content
CREATE TABLE public.weekly_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  week_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.weekly_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can manage weekly content" ON public.weekly_content FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.teacher_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.teacher_id = auth.uid()));
CREATE POLICY "Students can view published weekly content" ON public.weekly_content FOR SELECT TO authenticated
  USING (is_published = true AND EXISTS (SELECT 1 FROM public.enrollments e WHERE e.course_id = course_id AND e.student_id = auth.uid()));

CREATE TRIGGER update_weekly_content_updated_at BEFORE UPDATE ON public.weekly_content FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Weekly content assets
CREATE TABLE public.weekly_content_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_content_id UUID REFERENCES public.weekly_content(id) ON DELETE CASCADE NOT NULL,
  file_url TEXT DEFAULT '',
  link_url TEXT DEFAULT '',
  file_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.weekly_content_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can manage wc assets" ON public.weekly_content_assets FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.weekly_content wc JOIN public.courses c ON c.id = wc.course_id WHERE wc.id = weekly_content_id AND c.teacher_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.weekly_content wc JOIN public.courses c ON c.id = wc.course_id WHERE wc.id = weekly_content_id AND c.teacher_id = auth.uid()));
CREATE POLICY "Students can view published wc assets" ON public.weekly_content_assets FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.weekly_content wc JOIN public.enrollments e ON e.course_id = wc.course_id WHERE wc.id = weekly_content_id AND wc.is_published = true AND e.student_id = auth.uid()));

-- Assignments
CREATE TABLE public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  due_date TIMESTAMPTZ,
  points INTEGER DEFAULT 0,
  weight NUMERIC(5,2) DEFAULT 0,
  estimated_time_minutes INTEGER DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can manage assignments" ON public.assignments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.teacher_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.teacher_id = auth.uid()));
CREATE POLICY "Students can view published assignments" ON public.assignments FOR SELECT TO authenticated
  USING (is_published = true AND EXISTS (SELECT 1 FROM public.enrollments e WHERE e.course_id = course_id AND e.student_id = auth.uid()));

CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON public.assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Assignment assets
CREATE TABLE public.assignment_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE NOT NULL,
  file_url TEXT DEFAULT '',
  link_url TEXT DEFAULT '',
  file_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.assignment_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can manage assignment assets" ON public.assignment_assets FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assignments a JOIN public.courses c ON c.id = a.course_id WHERE a.id = assignment_id AND c.teacher_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assignments a JOIN public.courses c ON c.id = a.course_id WHERE a.id = assignment_id AND c.teacher_id = auth.uid()));
CREATE POLICY "Students can view published assignment assets" ON public.assignment_assets FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assignments a JOIN public.enrollments e ON e.course_id = a.course_id WHERE a.id = assignment_id AND a.is_published = true AND e.student_id = auth.uid()));

-- Course files
CREATE TABLE public.course_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  uploaded_by UUID NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'syllabus',
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.course_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can manage course files" ON public.course_files FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.teacher_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.teacher_id = auth.uid()));
CREATE POLICY "Students can view course files" ON public.course_files FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.enrollments e WHERE e.course_id = course_id AND e.student_id = auth.uid()));

-- Project portfolios
CREATE TABLE public.project_portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  github_url TEXT DEFAULT '',
  tech_stack TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.project_portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view portfolios" ON public.project_portfolios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Students can insert own portfolios" ON public.project_portfolios FOR INSERT TO authenticated WITH CHECK (student_id = auth.uid());
CREATE POLICY "Students can update own portfolios" ON public.project_portfolios FOR UPDATE TO authenticated USING (student_id = auth.uid());
CREATE POLICY "Students can delete own portfolios" ON public.project_portfolios FOR DELETE TO authenticated USING (student_id = auth.uid());

CREATE TRIGGER update_portfolios_updated_at BEFORE UPDATE ON public.project_portfolios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Content reports
CREATE TABLE public.content_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  reporter_id UUID NOT NULL,
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.content_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create reports" ON public.content_reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
CREATE POLICY "Teachers can view reports for own courses" ON public.content_reports FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.courses c WHERE c.id = course_id AND c.teacher_id = auth.uid()));
CREATE POLICY "Reporters can view own reports" ON public.content_reports FOR SELECT TO authenticated USING (reporter_id = auth.uid());

-- AI chats
CREATE TABLE public.ai_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own AI chats" ON public.ai_chats FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Storage bucket for course files
INSERT INTO storage.buckets (id, name, public) VALUES ('course-files', 'course-files', true);

CREATE POLICY "Authenticated users can upload course files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'course-files');
CREATE POLICY "Anyone can view course files" ON storage.objects FOR SELECT USING (bucket_id = 'course-files');
CREATE POLICY "File owners can delete course files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'course-files' AND auth.uid()::text = (storage.foldername(name))[1]);
