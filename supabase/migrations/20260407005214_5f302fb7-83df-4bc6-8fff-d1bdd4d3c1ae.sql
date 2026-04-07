
CREATE TABLE public.page_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  page_path text NOT NULL,
  user_role text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.click_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  page_path text NOT NULL,
  element_tag text NOT NULL,
  element_text text,
  element_id text,
  element_class text,
  user_role text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.click_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can insert page views"
ON public.page_views FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Anyone authenticated can read page views"
ON public.page_views FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Anyone authenticated can insert click events"
ON public.click_events FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Anyone authenticated can read click events"
ON public.click_events FOR SELECT TO authenticated
USING (true);

CREATE INDEX idx_page_views_page_path ON public.page_views(page_path);
CREATE INDEX idx_page_views_created_at ON public.page_views(created_at);
CREATE INDEX idx_click_events_page_path ON public.click_events(page_path);
CREATE INDEX idx_click_events_created_at ON public.click_events(created_at);
