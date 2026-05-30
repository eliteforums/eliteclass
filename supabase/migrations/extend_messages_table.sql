-- =============================================================================
-- EliteClass — Extend Messages Table for Rich Message Types
--
-- Adds support for rich messages (GIFs, emojis) in batch chat:
--   • message_type column to distinguish text, gif, and emoji messages
--   • gif_url column to store GIF image URLs
--   • metadata column for extensible message data
--
-- Requirements: 7.5, 7.6
-- =============================================================================

-- ============================================================
-- 1. Add message_type column
--    Values: 'text' (default), 'gif', 'emoji'
-- ============================================================

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) NOT NULL DEFAULT 'text';

-- ============================================================
-- 2. Add gif_url column for GIF message URLs
-- ============================================================

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS gif_url TEXT;

-- ============================================================
-- 3. Add metadata column for extensible message data
-- ============================================================

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- ============================================================
-- 4. Allow NULL content for GIF messages
--    The original table defined content as NOT NULL. GIF messages
--    carry their payload in gif_url, so content can be NULL.
-- ============================================================

ALTER TABLE public.messages
  ALTER COLUMN content DROP NOT NULL;

-- ============================================================
-- 5. Update content constraint to allow NULL content for GIF messages
--    The original constraint required non-empty content for all messages.
--    With GIF messages, content may be NULL (the gif_url carries the payload).
-- ============================================================

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_content_length;

ALTER TABLE public.messages
  ADD CONSTRAINT messages_content_check CHECK (
    CASE
      WHEN message_type = 'text' THEN
        content IS NOT NULL AND char_length(content) > 0 AND char_length(content) <= 4000
      WHEN message_type = 'gif' THEN
        gif_url IS NOT NULL AND char_length(gif_url) > 0
      WHEN message_type = 'emoji' THEN
        content IS NOT NULL AND char_length(content) > 0 AND char_length(content) <= 4000
      ELSE
        content IS NOT NULL AND char_length(content) > 0 AND char_length(content) <= 4000
    END
  );

-- ============================================================
-- 6. Add CHECK constraint for valid message_type values
-- ============================================================

ALTER TABLE public.messages
  ADD CONSTRAINT messages_type_check CHECK (
    message_type IN ('text', 'gif', 'emoji')
  );
