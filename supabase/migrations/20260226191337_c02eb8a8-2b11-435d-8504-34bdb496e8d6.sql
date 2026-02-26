
-- Create folders table for weekly content
CREATE TABLE public.weekly_content_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_content_id uuid NOT NULL REFERENCES public.weekly_content(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.weekly_content_folders ENABLE ROW LEVEL SECURITY;

-- Helper function to get course_id from folder
CREATE OR REPLACE FUNCTION public.get_folder_course_id(_folder_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT wc.course_id
  FROM public.weekly_content_folders f
  JOIN public.weekly_content wc ON wc.id = f.weekly_content_id
  WHERE f.id = _folder_id;
$$;

-- Teachers can manage folders
CREATE POLICY "Teachers can manage folders"
ON public.weekly_content_folders FOR ALL
TO authenticated
USING (is_course_teacher(get_wc_course_id(weekly_content_id), auth.uid()))
WITH CHECK (is_course_teacher(get_wc_course_id(weekly_content_id), auth.uid()));

-- Students can view folders for published weeks
CREATE POLICY "Students can view published folders"
ON public.weekly_content_folders FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM weekly_content wc
  WHERE wc.id = weekly_content_folders.weekly_content_id
    AND wc.is_published = true
    AND is_enrolled(wc.course_id, auth.uid())
));

-- Add optional folder_id to weekly_content_assets
ALTER TABLE public.weekly_content_assets
ADD COLUMN folder_id uuid REFERENCES public.weekly_content_folders(id) ON DELETE CASCADE;
