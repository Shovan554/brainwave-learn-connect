
-- Posts table
CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL,
  content text NOT NULL,
  image_url text NULL,
  likes_count integer NOT NULL DEFAULT 0,
  comments_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view posts" ON public.posts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can create own posts" ON public.posts
  FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());

CREATE POLICY "Users can update own posts" ON public.posts
  FOR UPDATE TO authenticated USING (author_id = auth.uid());

CREATE POLICY "Users can delete own posts" ON public.posts
  FOR DELETE TO authenticated USING (author_id = auth.uid());

-- Post likes table
CREATE TABLE public.post_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view post likes" ON public.post_likes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can like posts" ON public.post_likes
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can unlike posts" ON public.post_likes
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Post comments table
CREATE TABLE public.post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view post comments" ON public.post_comments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can create comments" ON public.post_comments
  FOR INSERT TO authenticated WITH CHECK (author_id = auth.uid());

CREATE POLICY "Users can delete own comments" ON public.post_comments
  FOR DELETE TO authenticated USING (author_id = auth.uid());

-- Trigger to sync likes_count
CREATE OR REPLACE FUNCTION public.update_post_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER on_post_like_change
AFTER INSERT OR DELETE ON public.post_likes
FOR EACH ROW EXECUTE FUNCTION public.update_post_likes_count();

-- Trigger to sync comments_count
CREATE OR REPLACE FUNCTION public.update_post_comments_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET comments_count = GREATEST(0, comments_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER on_post_comment_change
AFTER INSERT OR DELETE ON public.post_comments
FOR EACH ROW EXECUTE FUNCTION public.update_post_comments_count();

-- Storage bucket for post images
INSERT INTO storage.buckets (id, name, public) VALUES ('post-images', 'post-images', true);

CREATE POLICY "Anyone can view post images" ON storage.objects
  FOR SELECT USING (bucket_id = 'post-images');

CREATE POLICY "Authenticated users can upload post images" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'post-images');

CREATE POLICY "Users can delete own post images" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'post-images' AND (storage.foldername(name))[1] = auth.uid()::text);
