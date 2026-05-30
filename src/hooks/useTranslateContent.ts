// ---------------------------------------------------------------------------
// useTranslateContent — Dynamic content translation hook
//
// Translates user-generated content (announcements, notifications, course names)
// to the user's selected locale using the translate service with React Query
// for caching and request deduplication.
//
// Usage:
//   const { translatedText, isLoading, isError, fromCache } = useTranslateContent(text);
//
// On failure, returns the original text with isError = true so the UI can show
// a warning indicator alongside the untranslated content.
// ---------------------------------------------------------------------------

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { translateContent, type TranslationResult } from "@/services/translate.service";

export interface UseTranslateContentOptions {
  /** Override the target language (defaults to current i18n language). */
  targetLang?: string;
  /** Optional source language hint. If omitted, auto-detection is used. */
  sourceLang?: string;
  /** Whether translation is enabled. Set to false to skip translation. */
  enabled?: boolean;
}

export interface UseTranslateContentReturn {
  /** The translated text, or the original text if translation failed or is loading. */
  translatedText: string;
  /** Whether the translation request is in progress. */
  isLoading: boolean;
  /** Whether the translation request failed. */
  isError: boolean;
  /** The error message if translation failed. */
  error: string | null;
  /** Whether the result was served from cache. */
  fromCache: boolean;
  /** Whether the content was truncated (exceeded 5000 chars). */
  truncated: boolean;
}

/**
 * Hook for translating dynamic user-generated content.
 *
 * Uses React Query for:
 * - Caching: identical requests are served from the query cache
 * - Deduplication: concurrent requests for the same text are merged
 * - Stale-while-revalidate: shows cached data while refreshing
 *
 * On failure, returns the original content so the UI can display it
 * with a warning indicator (per Requirement 4.2).
 */
export function useTranslateContent(
  text: string,
  options: UseTranslateContentOptions = {},
): UseTranslateContentReturn {
  const { i18n } = useTranslation();

  const targetLang = options.targetLang ?? i18n.language;
  const sourceLang = options.sourceLang;
  const enabled = options.enabled ?? true;

  // Skip translation when:
  // - text is empty/whitespace
  // - source language is known and matches target
  // - translation is explicitly disabled
  const shouldSkip =
    !enabled ||
    !text ||
    !text.trim() ||
    (sourceLang != null && sourceLang.toLowerCase() === targetLang.toLowerCase());

  const query = useQuery<TranslationResult | null, Error>({
    queryKey: ["translate-content", text, targetLang, sourceLang ?? "auto"],
    queryFn: async (): Promise<TranslationResult | null> => {
      const response = await translateContent(text, targetLang, sourceLang);

      if (!response.success || !response.data) {
        throw new Error(response.error ?? "Translation failed");
      }

      return response.data;
    },
    enabled: !shouldSkip,
    // Cache translations for 5 minutes in React Query (DB cache is 24h)
    staleTime: 5 * 60 * 1000,
    // Keep unused translations in cache for 10 minutes
    gcTime: 10 * 60 * 1000,
    // Don't retry aggressively — show original content on failure
    retry: 1,
    retryDelay: 1000,
  });

  // When skipped, return original text immediately
  if (shouldSkip) {
    return {
      translatedText: text,
      isLoading: false,
      isError: false,
      error: null,
      fromCache: false,
      truncated: false,
    };
  }

  // When loading, return original text as placeholder
  if (query.isLoading) {
    return {
      translatedText: text,
      isLoading: true,
      isError: false,
      error: null,
      fromCache: false,
      truncated: false,
    };
  }

  // When error, return original text with error flag
  // (UI should show warning indicator per Requirement 4.2)
  if (query.isError || !query.data) {
    return {
      translatedText: text,
      isLoading: false,
      isError: true,
      error: query.error?.message ?? "Translation failed",
      fromCache: false,
      truncated: false,
    };
  }

  // Success — return translated text
  return {
    translatedText: query.data.translatedText,
    isLoading: false,
    isError: false,
    error: null,
    fromCache: query.data.fromCache,
    truncated: query.data.truncated,
  };
}
