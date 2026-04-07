
-- Add optional course_id to reels so they can be tied to courses
ALTER TABLE public.reels ADD COLUMN course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL;

-- Create reel_views table to track which reels each user has seen
CREATE TABLE public.reel_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id uuid NOT NULL REFERENCES public.reels(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  viewed_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (reel_id, user_id)
);

ALTER TABLE public.reel_views ENABLE ROW LEVEL SECURITY;

-- Users can insert their own views
CREATE POLICY "Users can insert own views"
  ON public.reel_views FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can read own views
CREATE POLICY "Users can read own views"
  ON public.reel_views FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
