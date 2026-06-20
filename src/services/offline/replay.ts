// ---------------------------------------------------------------------------
// Outbox replay loop
// ---------------------------------------------------------------------------
//
// Walks `outbox.peekDue` and replays each entry against the Supabase REST
// API. Status mapping follows design.md Property 18 / 19:
//
//   2xx                          -> markSuccess + invalidate
//   408 / 429 / 5xx / network    -> markRetry (exp backoff, max 8)
//   other 4xx                    -> markDead
//
// Used by the foreground replay loop (Safari / no-SW) and, eventually, by
// the SW Background Sync handler in Phase G.
// ---------------------------------------------------------------------------

import type { QueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase";

import {
  markDead,
  markInFlight,
  markRetry,
  markSuccess,
  peekDue,
} from "./outbox";

let _draining = false;

const RETRYABLE_STATUSES = new Set([0, 408, 429]);

function isRetryableStatus(status: number): boolean {
  if (RETRYABLE_STATUSES.has(status)) return true;
  if (status >= 500 && status <= 599) return true;
  return false;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  if (!supabase) return headers;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (anonKey) headers.apikey = anonKey;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    } else if (anonKey) {
      headers.Authorization = `Bearer ${anonKey}`;
    }
  } catch {
    // ignore — replay will fail with 401 and be marked dead.
  }
  return headers;
}

interface DrainOptions {
  ownerUserId: string;
  queryClient: QueryClient;
  /** When true, surface throws instead of swallowing — used by tests. */
  rethrow?: boolean;
}

export async function drainOutbox({
  ownerUserId,
  queryClient,
  rethrow = false,
}: DrainOptions): Promise<{ replayed: number; failed: number }> {
  if (_draining) return { replayed: 0, failed: 0 };
  _draining = true;
  let replayed = 0;
  let failed = 0;
  try {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return { replayed: 0, failed: 0 };
    }

    while (true) {
      const due = await peekDue(ownerUserId);
      if (due.length === 0) break;

      const headers = await getAuthHeaders();

      for (const row of due) {
        await markInFlight(row.id);

        try {
          const response = await fetch(row.url, {
            method: row.method,
            headers: { ...headers, ...row.headers },
            body: row.body == null ? undefined : JSON.stringify(row.body),
          });

          if (response.ok) {
            await markSuccess(row.id);
            replayed += 1;
            // Notify React Query to refetch any keys this mutation touches.
            for (const key of row.invalidates) {
              try {
                queryClient.invalidateQueries({ queryKey: key as readonly unknown[] });
              } catch {
                // ignore — invalid keys should be caught in dev
              }
            }
            continue;
          }

          const status = response.status;
          const text = await response.text().catch(() => "");
          if (isRetryableStatus(status)) {
            await markRetry(row.id, `${status} ${text.slice(0, 200)}`);
            failed += 1;
          } else {
            // Permanent client error — move to dead-letter.
            await markDead(row.id, `${status} ${text.slice(0, 200)}`);
            failed += 1;
          }
        } catch (err) {
          // Network / abort / DNS failure — treat as retryable.
          const message = err instanceof Error ? err.message : String(err);
          await markRetry(row.id, `network: ${message.slice(0, 200)}`);
          failed += 1;
          if (rethrow) throw err;
        }
      }
    }
  } finally {
    _draining = false;
  }
  return { replayed, failed };
}
