
-- Conversations table (DMs between two users)
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Conversation participants
CREATE TABLE public.conversation_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

-- Messages table
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Message attachments
CREATE TABLE public.message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_type text NOT NULL DEFAULT 'file',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;

-- RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

-- Helper function: check if user is in conversation
CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conversation_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = _conversation_id AND user_id = _user_id
  );
$$;

-- Conversations: participants can view
CREATE POLICY "Participants can view conversations"
ON public.conversations FOR SELECT TO authenticated
USING (is_conversation_participant(id, auth.uid()));

-- Conversations: authenticated users can create
CREATE POLICY "Authenticated users can create conversations"
ON public.conversations FOR INSERT TO authenticated
WITH CHECK (true);

-- Participants: can view own conversations' participants
CREATE POLICY "Participants can view conversation members"
ON public.conversation_participants FOR SELECT TO authenticated
USING (is_conversation_participant(conversation_id, auth.uid()));

-- Participants: can add themselves
CREATE POLICY "Users can join conversations"
ON public.conversation_participants FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- Allow adding other users to conversations you're in
CREATE POLICY "Participants can add others"
ON public.conversation_participants FOR INSERT TO authenticated
WITH CHECK (is_conversation_participant(conversation_id, auth.uid()));

-- Messages: participants can view
CREATE POLICY "Participants can view messages"
ON public.messages FOR SELECT TO authenticated
USING (is_conversation_participant(conversation_id, auth.uid()));

-- Messages: participants can send
CREATE POLICY "Participants can send messages"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (sender_id = auth.uid() AND is_conversation_participant(conversation_id, auth.uid()));

-- Attachments: participants can view
CREATE POLICY "Participants can view attachments"
ON public.message_attachments FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.messages m
  WHERE m.id = message_attachments.message_id
  AND is_conversation_participant(m.conversation_id, auth.uid())
));

-- Attachments: sender can add
CREATE POLICY "Senders can add attachments"
ON public.message_attachments FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.messages m
  WHERE m.id = message_attachments.message_id
  AND m.sender_id = auth.uid()
));

-- Storage bucket for message attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('message-attachments', 'message-attachments', true);

-- Storage policies for message attachments
CREATE POLICY "Authenticated users can upload message attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'message-attachments');

CREATE POLICY "Anyone can view message attachments"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'message-attachments');
