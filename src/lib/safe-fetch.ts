// ---------------------------------------------------------------------------
// Safe fetch — timeouts, retries, and normalized errors for Supabase / HTTP.
// Eliminates opaque "FetchError: undefined" by always attaching a message.
// ---------------------------------------------------------------------------

import { getErrorMessage, isAbortError, sleep } from "@/utils/helpers";

const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_RETRIES = 2;
const RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface SafeFetchOptions {
  timeoutMs?: number;
  retries?: number;
}

export function normalizeFetchError(err: unknown, fallback = "Network request failed."): Error {
  const message = getErrorMessage(err, fallback);
  const normalized = new Error(message);
  if (err instanceof Error && err.name) {
    normalized.name = err.name;
  } else {
    normalized.name = "FetchError";
  }
  if (
    normalized.name === "FetchError" &&
    (!normalized.message || normalized.message === "undefined")
  ) {
    normalized.message =
      "Unable to reach the server. Check your connection and Supabase configuration.";
  }
  return normalized;
}

/**
 * Drop-in replacement for `globalThis.fetch` used by the Supabase client.
 */
export function createSupabaseFetch(options: SafeFetchOptions = {}): typeof fetch {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.retries ?? MAX_RETRIES;

  return async function safeFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort("timeout"), timeoutMs);

      const onParentAbort = () => controller.abort("parent");
      init?.signal?.addEventListener("abort", onParentAbort);

      try {
        const response = await fetch(input, {
          ...init,
          signal: controller.signal,
        });

        if (!response.ok && RETRY_STATUSES.has(response.status) && attempt < maxRetries) {
          await sleep(250 * (attempt + 1));
          continue;
        }

        return response;
      } catch (err) {
        lastError = err;
        if (isAbortError(err)) {
          throw normalizeFetchError(err, "Request was cancelled or timed out.");
        }
        if (attempt < maxRetries) {
          await sleep(250 * (attempt + 1));
          continue;
        }
        throw normalizeFetchError(lastError);
      } finally {
        clearTimeout(timeoutId);
        init?.signal?.removeEventListener("abort", onParentAbort);
      }
    }

    throw normalizeFetchError(lastError);
  };
}
