-- =============================================================================
-- EliteClass — Avatar Support Migration
--
-- The users table already has an avatar_url column (TEXT, nullable).
-- This migration ensures it exists and adds a comment for documentation.
--
-- Avatar URL format:
--   - "dicebear:{style}:{seed}" — rendered via DiceBear API
--   - "avvvatars:{style}:{seed}" — rendered via avvvatars-react
--   - "boring:{variant}:{seed}" — rendered via boring-avatars
--   - "https://..." — regular uploaded image URL
--   - NULL — uses initials fallback
--
-- No schema changes needed if avatar_url already exists.
-- This file is for reference and ensures the column is present.
-- =============================================================================

-- Ensure avatar_url column exists on users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.users.avatar_url IS
  'User profile avatar. Stores either a config string (e.g. "dicebear:lorelei:seed123") resolved client-side, or a direct image URL.';

-- Ensure the update profile policy allows avatar_url updates
-- (The existing "user_update_own_profile" policy already covers this since
-- it allows UPDATE on all columns WHERE id = auth.uid())

-- No additional RLS needed — existing policies cover avatar_url updates.
