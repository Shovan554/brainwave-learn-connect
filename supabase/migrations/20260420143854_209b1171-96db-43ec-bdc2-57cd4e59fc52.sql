CREATE OR REPLACE FUNCTION public.search_teachers(_query text)
RETURNS TABLE(user_id uuid, name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.user_id, p.name
  FROM public.profiles p
  JOIN public.user_roles r ON r.user_id = p.user_id AND r.role = 'teacher'::app_role
  WHERE p.name ILIKE '%' || _query || '%'
  ORDER BY p.name
  LIMIT 10;
$function$;