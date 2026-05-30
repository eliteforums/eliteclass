// ---------------------------------------------------------------------------
// EliteClass — Translation Service
//
// Dynamic content translation via Google Translate API with caching.
// Used by:
//   - useTranslateContent hook (on-demand translation of user-generated content)
//
// Every function returns ApiResponse<T> — never throws.
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";
import type { ApiResponse } from "@/types";

const SUPABASE_NOT_CONFIGURED = {
  data: null,
  error: "Supabase is not configured.",
  success: false,
} as const;

// ── Constants ────────────────────────────────────────────────────────────────

/** Maximum characters to translate. Content beyond this is truncated. */
const MAX_CONTENT_LENGTH = 5000;

/** Truncation indicator appended when content exceeds MAX_CONTENT_LENGTH. */
const TRUNCATION_INDICATOR = "… [truncated]";

/** Cache TTL in hours. */
const CACHE_TTL_HOURS = 24;

// ── Types ────────────────────────────────────────────────────────────────────

export interface TranslationResult {
  translatedText: string;
  detectedSourceLang: string;
  fromCache: boolean;
  truncated: boolean;
}

// ── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Generates a SHA-256 hash of the given text.
 * Uses the Web Crypto API (available in browsers and Cloudflare Workers).
 */
export async function hashText(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Truncates text to MAX_CONTENT_LENGTH characters.
 * Returns the (possibly truncated) text and whether truncation occurred.
 */
export function truncateContent(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_CONTENT_LENGTH) {
    return { text, truncated: false };
  }
  return { text: text.slice(0, MAX_CONTENT_LENGTH), truncated: true };
}

/**
 * Calls the Google Translate API (free endpoint) to translate text.
 * Returns the translated text and detected source language.
 */
async function callGoogleTranslateAPI(
  text: string,
  targetLang: string,
  sourceLang?: string,
): Promise<{ translatedText: string; detectedLang: string }> {
  const sl = sourceLang || "auto";
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Google Translate API returned ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  // The response format is: [[["translated text","source text",null,null,10]],null,"detected_lang"]
  // Extract translated text from all sentence segments
  let translatedText = "";
  if (Array.isArray(data) && Array.isArray(data[0])) {
    for (const segment of data[0]) {
      if (Array.isArray(segment) && segment[0]) {
        translatedText += segment[0];
      }
    }
  }

  // Detected language is at index 2
  const detectedLang: string = (data && data[2]) || sourceLang || "en";

  if (!translatedText) {
    throw new Error("Google Translate API returned empty translation");
  }

  return { translatedText, detectedLang };
}

// ── Cache Operations ─────────────────────────────────────────────────────────

/**
 * Looks up a cached translation in the translation_cache table.
 * Returns null if no valid (non-expired) cache entry exists.
 */
async function getCachedTranslation(
  sourceTextHash: string,
  sourceLang: string,
  targetLang: string,
): Promise<{ translated_text: string } | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("translation_cache")
    .select("translated_text")
    .eq("source_text_hash", sourceTextHash)
    .eq("source_lang", sourceLang)
    .eq("target_lang", targetLang)
    .gt("expires_at", new Date().toISOString())
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as { translated_text: string };
}

/**
 * Stores a translation result in the cache with a 24-hour TTL.
 * Uses upsert to handle race conditions gracefully.
 */
async function cacheTranslation(
  sourceTextHash: string,
  sourceLang: string,
  targetLang: string,
  translatedText: string,
): Promise<void> {
  if (!supabase) return;

  const expiresAt = new Date(Date.now() + CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString();

  await supabase.from("translation_cache").upsert(
    {
      source_text_hash: sourceTextHash,
      source_lang: sourceLang,
      target_lang: targetLang,
      translated_text: translatedText,
      expires_at: expiresAt,
    },
    {
      onConflict: "source_text_hash,source_lang,target_lang",
    },
  );
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Translates user-generated content to the target language.
 *
 * Flow:
 * 1. Skip translation if source language matches target language
 * 2. Truncate content at 5000 characters if needed
 * 3. Check cache (translation_cache table) for existing translation
 * 4. If cache miss, call Google Translate API
 * 5. Store result in cache with 24-hour TTL
 *
 * @param text - The text to translate
 * @param targetLang - Target language code (e.g., 'hi', 'mr', 'es', 'fr')
 * @param sourceLang - Optional source language code. If not provided, auto-detection is used.
 * @returns ApiResponse with TranslationResult
 */
export async function translateContent(
  text: string,
  targetLang: string,
  sourceLang?: string,
): Promise<ApiResponse<TranslationResult>> {
  if (!supabase) return SUPABASE_NOT_CONFIGURED;

  try {
    // Validate inputs
    if (!text || !text.trim()) {
      return {
        data: {
          translatedText: text,
          detectedSourceLang: sourceLang || "en",
          fromCache: false,
          truncated: false,
        },
        error: null,
        success: true,
      };
    }

    if (!targetLang || !targetLang.trim()) {
      return { data: null, error: "Target language is required.", success: false };
    }

    // Skip translation when source language matches target language
    if (sourceLang && sourceLang.toLowerCase() === targetLang.toLowerCase()) {
      return {
        data: {
          translatedText: text,
          detectedSourceLang: sourceLang,
          fromCache: false,
          truncated: false,
        },
        error: null,
        success: true,
      };
    }

    // Truncate content at 5000 characters
    const { text: processedText, truncated } = truncateContent(text);

    // Generate cache key from the processed (possibly truncated) text
    const sourceTextHash = await hashText(processedText);

    // Determine source language for cache lookup
    // If sourceLang is not provided, we use "auto" as the cache key for source_lang
    const cacheSrcLang = sourceLang || "auto";

    // Check cache first
    const cached = await getCachedTranslation(sourceTextHash, cacheSrcLang, targetLang);
    if (cached) {
      const translatedText = truncated
        ? cached.translated_text + TRUNCATION_INDICATOR
        : cached.translated_text;

      return {
        data: {
          translatedText,
          detectedSourceLang: cacheSrcLang === "auto" ? targetLang : cacheSrcLang,
          fromCache: true,
          truncated,
        },
        error: null,
        success: true,
      };
    }

    // Cache miss — call Google Translate API
    const { translatedText: rawTranslation, detectedLang } = await callGoogleTranslateAPI(
      processedText,
      targetLang,
      sourceLang,
    );

    // If detected source language matches target, skip translation and return original
    if (!sourceLang && detectedLang.toLowerCase() === targetLang.toLowerCase()) {
      return {
        data: {
          translatedText: text,
          detectedSourceLang: detectedLang,
          fromCache: false,
          truncated: false,
        },
        error: null,
        success: true,
      };
    }

    // Store in cache (fire-and-forget, don't block on cache write)
    cacheTranslation(sourceTextHash, cacheSrcLang, targetLang, rawTranslation).catch(() => {
      // Silently ignore cache write failures
    });

    // Append truncation indicator if content was truncated
    const finalText = truncated ? rawTranslation + TRUNCATION_INDICATOR : rawTranslation;

    return {
      data: {
        translatedText: finalText,
        detectedSourceLang: detectedLang,
        fromCache: false,
        truncated,
      },
      error: null,
      success: true,
    };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Translation failed",
      success: false,
    };
  }
}
