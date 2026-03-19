-- Fix notifications insert policy to be more specific
DROP POLICY "System can insert notifications" ON public.notifications;
CREATE POLICY "Users can insert own notifications" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());