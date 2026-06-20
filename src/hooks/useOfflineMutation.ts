// ---------------------------------------------------------------------------
// useOfflineMutation — wraps useMutation with optimistic + outbox routing
// ---------------------------------------------------------------------------
//
// Every offline-aware mutation should funnel through this hook. The flow:
//
//   1. caller invokes mutate(vars)
//   2. we resolve the Supabase REST request (URL/method/body) via toRequest
//   3. apply optimisticUpdate (if provided)
//   4. enqueue an OutboxRow (skipped when onlineOnly === true)
//   5. trigger an immediate drainOutbox() so online callers see no delay
//
// When `onlineOnly: true`:
//   - if offline -> throw OfflineFeatureError
//   - if online  -> still uses outbox to keep the bookkeeping uniform
//
// When `useOfflineCapability().canQueueWrites === false` AND offline:
//   - throw OfflineFeatureError("offline queue unavailable") so calls don't
//     silently get dropped (Req 18.4).
// ---------------------------------------------------------------------------

import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
  type UseMutationResult,
} from "@tanstack/react-query";

import { useAuthStore } from "@/store/authStore";

import { useNetwork } from "./useNetwork";
import { useOfflineCapability } from "./useOfflineCapability";

import { drainOutbox } from "@/services/offline/replay";
import { enqueue } from "@/services/offline/outbox";

export class OfflineFeatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfflineFeatureError";
  }
}

export type OfflineOp = "POST" | "PATCH" | "PUT" | "DELETE";

export interface OfflineMutationConfig<TVars, TResult> {
  toRequest: (vars: TVars) => { url: string; method: OfflineOp; body: unknown };
  entityType: string;
  entityId: (vars: TVars) => string | null;
  baseUpdatedAt?: (vars: TVars) => string | null;
  invalidates: (vars: TVars) => ReadonlyArray<readonly unknown[]>;
  /**
   * Optional per-request HTTP headers attached to the OutboxRow. The replay
   * loop merges these on top of the default Authorization / apikey /
   * Content-Type / Prefer headers so callers can, e.g., pass
   * `Prefer: resolution=merge-duplicates` for PostgREST upserts.
   */
  extraHeaders?:
    | Record<string, string>
    | ((vars: TVars) => Record<string, string>);
  /** Optimistic UI update applied before the network round-trip. */
  optimisticUpdate?: (
    queryClient: ReturnType<typeof useQueryClient>,
    vars: TVars,
    optimisticId: string,
  ) => void;
  /**
   * When true, refuse to enqueue while offline. Used for auth, AI, payment,
   * and large-upload flows that cannot be queued (Req 9).
   */
  onlineOnly?: boolean;
  /**
   * Optional explicit success result builder. If omitted, the hook returns
   * `{ queuedId, optimisticId }` so callers can render a "queued" state.
   */
  onResult?: (vars: TVars, queued: { queuedId: string; optimisticId: string }) => TResult;
  /** Extra `useMutation` options (onSuccess/onError handlers, retry, etc.). */
  mutationOptions?: Omit<
    UseMutationOptions<unknown, unknown, TVars>,
    "mutationFn"
  >;
}

export interface OfflineMutationQueued {
  queuedId: string;
  optimisticId: string;
}

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function useOfflineMutation<TVars, TResult = OfflineMutationQueued>(
  config: OfflineMutationConfig<TVars, TResult>,
): UseMutationResult<TResult, Error, TVars> {
  const queryClient = useQueryClient();
  const { isOnline } = useNetwork();
  const capability = useOfflineCapability();
  const user = useAuthStore((s) => s.user);

  return useMutation<TResult, Error, TVars>({
    ...(config.mutationOptions ?? {}),
    mutationFn: async (vars: TVars) => {
      // Online-only carve-outs (Req 9.2): refuse to enqueue while offline.
      if (config.onlineOnly && !isOnline) {
        throw new OfflineFeatureError("This feature requires a connection");
      }

      // PWA-disabled fallback (Req 18.4): when SW + Background Sync are
      // unavailable AND we're offline, fail loudly rather than queue work
      // that will never drain.
      if (!isOnline && !capability.canQueueWrites) {
        throw new OfflineFeatureError(
          "offline queue unavailable: enable PWA build to queue writes",
        );
      }

      const ownerUserId = user?.id ?? null;
      if (!ownerUserId) {
        throw new Error("Not signed in");
      }

      const optimisticId = uuid();

      // Optimistic UI: caller decides what to update in React Query cache
      // and snapshot store. Failures here should not block the enqueue.
      try {
        config.optimisticUpdate?.(queryClient, vars, optimisticId);
      } catch (err) {
        if (typeof console !== "undefined") {
          console.warn("[offline] optimistic update threw", err);
        }
      }

      const request = config.toRequest(vars);
      const baseUpdatedAt = config.baseUpdatedAt?.(vars) ?? null;
      const entityId = config.entityId(vars);
      const invalidates = config.invalidates(vars);
      const extraHeaders =
        typeof config.extraHeaders === "function"
          ? config.extraHeaders(vars)
          : config.extraHeaders;

      const row = await enqueue({
        ownerUserId,
        url: request.url,
        method: request.method,
        body: request.body,
        headers: extraHeaders,
        entityType: config.entityType,
        entityId,
        optimisticId,
        baseUpdatedAt,
        invalidates,
      });

      // Kick the foreground drain. The SW Background Sync handler (Phase G)
      // will also pick this up; the two paths are idempotent because each
      // entry transitions to "in_flight" before fetch.
      if (isOnline) {
        drainOutbox({ ownerUserId, queryClient }).catch((err) => {
          if (typeof console !== "undefined") {
            console.warn("[offline] drain failed", err);
          }
        });
      }

      const queued: OfflineMutationQueued = {
        queuedId: row.id,
        optimisticId,
      };
      return (config.onResult?.(vars, queued) ?? queued) as TResult;
    },
  });
}
