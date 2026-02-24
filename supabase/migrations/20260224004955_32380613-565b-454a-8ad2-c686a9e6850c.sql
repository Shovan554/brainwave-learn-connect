
-- Function to look up a course ID by invite code, bypassing RLS
CREATE OR REPLACE FUNCTION public.get_course_id_by_invite_code(_code text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.courses WHERE invite_code = _code LIMIT 1;
$$;
