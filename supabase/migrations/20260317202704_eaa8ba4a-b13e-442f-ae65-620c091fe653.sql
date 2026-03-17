
-- Allow participants to delete conversations they're part of
CREATE POLICY "Participants can delete conversations"
ON public.conversations
FOR DELETE
TO authenticated
USING (is_conversation_participant(id, auth.uid()));

-- Allow cascade: participants can delete participant rows for conversations they're in
CREATE POLICY "Participants can delete conversation members"
ON public.conversation_participants
FOR DELETE
TO authenticated
USING (is_conversation_participant(conversation_id, auth.uid()));

-- Allow cascade: participants can delete messages in their conversations
CREATE POLICY "Participants can delete messages"
ON public.messages
FOR DELETE
TO authenticated
USING (is_conversation_participant(conversation_id, auth.uid()));

-- Allow cascade: delete attachments for messages in participant's conversations
CREATE POLICY "Participants can delete attachments"
ON public.message_attachments
FOR DELETE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM messages m
  WHERE m.id = message_attachments.message_id
  AND is_conversation_participant(m.conversation_id, auth.uid())
));
