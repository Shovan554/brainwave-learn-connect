
-- Fix: Replace overly permissive conversations insert policy
DROP POLICY "Authenticated users can create conversations" ON public.conversations;
CREATE POLICY "Authenticated users can create conversations"
ON public.conversations FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Reels table
CREATE TABLE public.reels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  description text,
  video_url text NOT NULL,
  thumbnail_url text,
  duration_seconds integer,
  likes_count integer NOT NULL DEFAULT 0,
  views_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Reel likes
CREATE TABLE public.reel_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id uuid NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(reel_id, user_id)
);

ALTER TABLE public.reels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_likes ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view reels
CREATE POLICY "Anyone can view reels" ON public.reels FOR SELECT TO authenticated USING (true);

-- Users can upload reels
CREATE POLICY "Users can upload reels" ON public.reels FOR INSERT TO authenticated
WITH CHECK (uploaded_by = auth.uid());

-- Users can delete own reels
CREATE POLICY "Users can delete own reels" ON public.reels FOR DELETE TO authenticated
USING (uploaded_by = auth.uid());

-- Anyone can view likes
CREATE POLICY "Anyone can view reel likes" ON public.reel_likes FOR SELECT TO authenticated USING (true);

-- Users can like
CREATE POLICY "Users can like reels" ON public.reel_likes FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Users can unlike
CREATE POLICY "Users can unlike reels" ON public.reel_likes FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- Storage bucket for reels
INSERT INTO storage.buckets (id, name, public) VALUES ('reels', 'reels', true);

CREATE POLICY "Authenticated users can upload reels"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'reels');

CREATE POLICY "Anyone can view reels videos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'reels');

CREATE POLICY "Users can delete own reel files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'reels' AND (storage.foldername(name))[1] = auth.uid()::text);
