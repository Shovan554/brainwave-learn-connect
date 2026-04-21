
CREATE OR REPLACE FUNCTION public.get_course_student_effort(_course_id uuid)
RETURNS TABLE(
  student_id uuid,
  reel_views_count integer,
  course_page_views_count integer,
  submissions_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only course teacher (or co-teacher) can call this
  IF NOT public.is_course_teacher(_course_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  WITH enrolled AS (
    SELECT e.student_id FROM public.enrollments e WHERE e.course_id = _course_id
  ),
  course_reels AS (
    SELECT r.id FROM public.reels r WHERE r.course_id = _course_id
  ),
  rv AS (
    SELECT v.user_id AS student_id, COUNT(*)::int AS c
    FROM public.reel_views v
    WHERE v.reel_id IN (SELECT id FROM course_reels)
    GROUP BY v.user_id
  ),
  pv AS (
    SELECT p.user_id AS student_id, COUNT(*)::int AS c
    FROM public.page_views p
    WHERE p.page_path LIKE '%' || _course_id::text || '%'
    GROUP BY p.user_id
  ),
  sub AS (
    SELECT s.student_id, COUNT(*)::int AS c
    FROM public.assignment_submissions s
    JOIN public.assignments a ON a.id = s.assignment_id
    WHERE a.course_id = _course_id
    GROUP BY s.student_id
  )
  SELECT
    e.student_id,
    COALESCE(rv.c, 0) AS reel_views_count,
    COALESCE(pv.c, 0) AS course_page_views_count,
    COALESCE(sub.c, 0) AS submissions_count
  FROM enrolled e
  LEFT JOIN rv ON rv.student_id = e.student_id
  LEFT JOIN pv ON pv.student_id = e.student_id
  LEFT JOIN sub ON sub.student_id = e.student_id;
END;
$$;
