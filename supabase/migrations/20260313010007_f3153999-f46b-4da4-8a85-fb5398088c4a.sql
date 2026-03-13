
CREATE POLICY "Participants can update conversations"
ON public.conversations
FOR UPDATE
TO authenticated
USING (is_conversation_participant(id, auth.uid()))
WITH CHECK (is_conversation_participant(id, auth.uid()));
