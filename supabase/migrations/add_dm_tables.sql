CREATE TABLE IF NOT EXISTS public.dm_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institute_id UUID NOT NULL REFERENCES public.institutes(id) ON DELETE CASCADE,
  participant_1_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  participant_2_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ,
  UNIQUE(participant_1_id, participant_2_id)
);

CREATE INDEX IF NOT EXISTS idx_dm_conversations_participant_1 ON public.dm_conversations (participant_1_id);
CREATE INDEX IF NOT EXISTS idx_dm_conversations_participant_2 ON public.dm_conversations (participant_2_id);

CREATE TABLE IF NOT EXISTS public.dm_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.dm_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT,
  message_type VARCHAR(20) NOT NULL DEFAULT 'text',
  gif_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dm_messages_conversation ON public.dm_messages (conversation_id, created_at DESC);

-- RLS
ALTER TABLE public.dm_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;

-- Participants can view their own conversations
CREATE POLICY "participants_view_own_conversations" ON public.dm_conversations
  FOR SELECT USING (
    participant_1_id = auth.uid() OR participant_2_id = auth.uid()
  );

-- Participants can create conversations they are part of
CREATE POLICY "participants_create_conversations" ON public.dm_conversations
  FOR INSERT WITH CHECK (
    participant_1_id = auth.uid() OR participant_2_id = auth.uid()
  );

-- Participants can update their own conversations (e.g. last_message_at)
CREATE POLICY "participants_update_own_conversations" ON public.dm_conversations
  FOR UPDATE USING (
    participant_1_id = auth.uid() OR participant_2_id = auth.uid()
  );

-- Participants can read messages in their conversations
CREATE POLICY "participants_read_messages" ON public.dm_messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT id FROM public.dm_conversations
      WHERE participant_1_id = auth.uid() OR participant_2_id = auth.uid()
    )
  );

-- Participants can send messages in their conversations
CREATE POLICY "participants_send_messages" ON public.dm_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND conversation_id IN (
      SELECT id FROM public.dm_conversations
      WHERE participant_1_id = auth.uid() OR participant_2_id = auth.uid()
    )
  );

-- Super admin access
CREATE POLICY "super_admin_dm_conversations" ON public.dm_conversations
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "super_admin_dm_messages" ON public.dm_messages
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());
