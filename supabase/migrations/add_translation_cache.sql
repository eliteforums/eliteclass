CREATE TABLE IF NOT EXISTS public.translation_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_text_hash VARCHAR(64) NOT NULL, -- SHA-256 of source text
  source_lang VARCHAR(10) NOT NULL,
  target_lang VARCHAR(10) NOT NULL,
  translated_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
  UNIQUE(source_text_hash, source_lang, target_lang)
);

-- Regular composite index for cache lookups (filtered by expires_at in queries)
CREATE INDEX IF NOT EXISTS idx_translation_cache_lookup
  ON public.translation_cache (source_text_hash, source_lang, target_lang, expires_at);

-- RLS
ALTER TABLE public.translation_cache ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read from the cache
CREATE POLICY "authenticated_read_cache" ON public.translation_cache
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- All authenticated users can insert into the cache
CREATE POLICY "authenticated_insert_cache" ON public.translation_cache
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Super admin full access
CREATE POLICY "super_admin_translation_cache" ON public.translation_cache
  FOR ALL USING (is_super_admin()) WITH CHECK (is_super_admin());
