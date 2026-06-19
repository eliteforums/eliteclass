# Cache Inventory (Phase 0 — exam-reattempts-and-offline-caching)

## Overview

EliteClass already ships a multi-layer caching story landed in commit `b2eaa61`:
an in-memory TTL dedupe cache used by service functions
(`src/lib/query-cache.ts`), a Cloudflare Workers edge cache wrapper for SSR/edge
paths (`src/lib/edge-cache.ts` plus `src/lib/cached-service.ts`), a TanStack
Query setup with category-based stale/gc tuning (`src/lib/query-keys.ts`,
wired through `src/router.tsx`), and a Workbox-based service worker
(`src/sw.ts` + `src/lib/sw-register.ts`) that precaches build assets, runs
`NetworkFirst` against `/rest/v1/*`, `StaleWhileRevalidate` against
`/storage/v1/*`, and queues failed `POST/PATCH/DELETE` mutations through
`BackgroundSyncPlugin('eliteclass-offline-queue')` with a 24h retention.

The offline-first feature plan **extends** this layer rather than replacing it
(Req 7.3, 7.4). The in-memory + edge layers stay untouched. The TanStack Query
side gains an IndexedDB persister and richer category constants. The service
worker keeps its read strategies (with `/rest/v1/*` upgraded from
`NetworkFirst` → `StaleWhileRevalidate`, per design) but its
`BackgroundSyncPlugin` queue is **replaced** by our own `Sync_Outbox` so that
optimistic UI, conflict detection, and dead-letter handling can run in
foreground (no-SW path) and background (SW path) using the same code.

## Module classification

| Module | Coverage | Storage | Invalidation | Classification | Notes |
|---|---|---|---|---|---|
| `src/lib/query-cache.ts` | Service-layer dedupe in `analytics.service.ts`, `staff.service.ts`, `schedule.service.ts`, `teacherStudents.service.ts` | In-memory `Map<string, CacheEntry<unknown>>` (browser memory, lost on reload) | `invalidateQueryCache(prefix?)` — clears all or by string prefix | **reuse-as-is** | Wraps short-lived (20–120s) fetches with `cachedQuery(key, ttlMs, loader)`. Does not need IndexedDB; complements the persisted query cache. |
| `src/lib/edge-cache.ts` | Cloudflare Workers `caches.default` wrapper used at the edge | CF Workers Cache API (`https://cache.internal/...` keys, scoped `public`/`user`) | `edgeCacheInvalidate(tags[])` via synthetic tag URLs | **reuse-as-is** | Never invoked from browser code today. Only the SSR/edge path can populate it. Browser inventory should leave it alone. |
| `src/lib/cached-service.ts` | Optional wrapper that combines `runService` + edge caching (`runCachedService(label, options, fn, request)`) | Delegates to `edge-cache.ts` | Delegates to `edge-cache.ts`; `invalidateServiceCache(tags)` helper | **reuse-as-is** | Currently unused by any service (grep shows zero callers). Available for future SSR-side caching. |
| `src/lib/query-keys.ts` | Centralized query key factories for institute/students/attendance/notifications/exams/fees and 4 staleTime/gcTime tiers (`institute`, `realtime`, `standard`, `static`) | In-memory constants | n/a | **extend-for-offline** | Add `QUERY_CATEGORIES` + `STALE_TIMES`/`GC_TIMES` and `getCategoryConfig(category)` per Req 8 (LIVE ≤30s, LISTS ≥5m/≥1h, CATALOG ≥1h/≥24h, DEFAULT ≥60s/≥30m). Existing `staleTimes`/`gcTimes`/`*QueryOptions()` helpers stay. |
| `src/router.tsx` (QueryClient instantiation) | Single `QueryClient` per request: `staleTime: 60_000`, `gcTime: 10 * 60_000`, `retry < 1`, `refetchOnReconnect: true`, `refetchOnMount: false` | TanStack Query in-memory cache | TanStack Query `invalidateQueries` | **extend-for-offline** | Will move into `src/lib/queryClient.ts` and gain `persistQueryClient` + `createAsyncStoragePersister` backed by `idb` keyval (`eliteclass-offline / tq-persister`), user-id-namespaced buster, sign-out clear (Req 9.1–9.6, 15.1). |
| `src/lib/sw-register.ts` | Production-only SW registration of `/sw.js`, exposes `onSWUpdateAvailable(cb)` and `skipWaitingAndReload()` | n/a | n/a | **extend-for-offline** | Add `useOfflineCapability` detection helpers: `'serviceWorker' in navigator`, `'sync' in registration`, `navigator.storage.persist?.()`. Surface a `'sync'` event hook so foreground replay can mirror the SW path. |
| `src/sw.ts` | Workbox PWA (gated by VitePWA flag, currently disabled in Vercel builds): precache, asset CacheFirst, locales SWR, fonts/CDN CacheFirst, `/rest/v1/* GET → NetworkFirst (5s)`, `/storage/v1/* → SWR`, `/auth/* → NetworkOnly`, navigation NetworkFirst (3s), Giphy SWR, **BackgroundSync `eliteclass-offline-queue`** for `POST/PATCH/DELETE` to `/rest/v1/*` (`maxRetentionTime: 24*60` min) | Workbox cache buckets: `eliteclass-static-v2`, `eliteclass-locales-v1`, `eliteclass-cdn-v1`, `eliteclass-icons-v1`, `eliteclass-api-v2`, `eliteclass-storage-v1`, `eliteclass-pages-v2`, `eliteclass-giphy-v1`, plus Workbox's internal queue store | `cleanupOutdatedCaches()` on activate; `CLEAR_AUTH_CACHE` postMessage purges `pages`/`api` buckets | **extend-for-offline** | Switch `/rest/v1/* GET` strategy from `NetworkFirst` → `StaleWhileRevalidate` (Req 10.1). Confirm `/storage/v1/* CacheFirst` w/ 30-day expiry + 100 MB cap (Req 10.2, 10.3). Add precache size cap (75 MB, Req 10.4). **Replace** the Workbox BG-sync queue with a custom `'sync'` handler that drains `Sync_Outbox` (see decision below). |
| `src/lib/storage-init.ts` | Supabase Storage **bucket bootstrap** (`ensureStorageBuckets`) | Server-side bucket creation; not a client cache | n/a | **reuse-as-is** | Listed for completeness. Not a caching module; design.md mentioned it for early IDB bootstrapping but the current file only ensures Supabase storage buckets exist. New IDB bootstrap belongs in `src/services/offline/db.ts` (Phase C.1). |

> The `staleTimes` / `gcTimes` constants in `query-keys.ts`:
> ```ts
> export const staleTimes = {
>   institute: 300_000,  // 5 min
>   realtime:  30_000,   // 30 s
>   standard:  60_000,   // 1 min
>   static:    600_000,  // 10 min
> } as const;
> ```
> The persisted query layer needs longer `gcTime` (≥30 min default, ≥24 h for catalog) so cached entries survive reloads. The new `getCategoryConfig` will sit alongside these constants without breaking callers.

> Existing Workbox queue:
> ```ts
> const bgSyncPlugin = new BackgroundSyncPlugin('eliteclass-offline-queue', {
>   maxRetentionTime: 24 * 60, // 24 hours in minutes
> });
> ```

## Decision: Workbox `BackgroundSyncPlugin` queue handling

**Decision: replace the Workbox `BackgroundSyncPlugin('eliteclass-offline-queue')`
queue with our own `Sync_Outbox` IndexedDB store, driven by a custom `'sync'`
event handler in `src/sw.ts`.**

Rationale:

1. The Workbox queue is opaque to the UI: it cannot expose pending entries to
   `OutboxPanel`, surface dead-letter rows, or attach `baseUpdatedAt` for the
   LWW conflict policy (Req 13.6, 14.1, 16.6).
2. The Workbox queue does not support a foreground-replay fallback when
   `hasBackgroundSync === false` (Safari / no-SW dev / VitePWA disabled
   builds). Our outbox needs to drain in foreground via `useOfflineMutation`'s
   replay loop (Req 13.7, 18.3).
3. The Workbox queue cannot cooperate with optimistic-UI ID swaps or scoped
   `purgeForUser` on sign-out (Req 13.8).
4. We still want Workbox's `'sync'` event registration plumbing — only the
   queue _storage_ and replay logic move into our outbox.

What this means concretely:

- `src/sw.ts` keeps its existing imports of `workbox-background-sync` only
  long enough to avoid a build break, then drops `BackgroundSyncPlugin`. The
  `NetworkOnly({ plugins: [bgSyncPlugin] })` route for
  `POST/PATCH/DELETE → /rest/v1/*` is removed; mutations are intercepted
  earlier by `useOfflineMutation` and never hit `fetch()` while offline.
- Any entries already sitting in the existing Workbox queue at upgrade time
  would be lost. **Mitigation:** the `maxRetentionTime` is 24 hours, so a
  one-time release window where users come online before the upgrade ships
  drains the legacy queue. We accept this and document it in the release
  notes for Phase G.
- The new SW registers a `'sync'` listener under tag
  `'eliteclass-outbox'` (NOT `'eliteclass-offline-queue'`, to avoid a
  retention-time collision with stale Workbox entries) that calls into the
  shared `outbox.replayDue()` API.

## Sync Outbox integration plan

Concrete next steps (executed by Phase B/C tasks, listed here for traceability):

1. **B.2** — extend `src/lib/query-keys.ts` with `QUERY_CATEGORIES`,
   `STALE_TIMES`, `GC_TIMES`, `getCategoryConfig`. Keep existing exports
   intact.
2. **B.3** — create `src/lib/queryClient.ts` that builds the QueryClient
   from `getCategoryConfig('default')` and wires `persistQueryClient` with
   `createAsyncStoragePersister` over `idb` keyval at
   `eliteclass-offline / tq-persister`, namespaced by `auth.users.id`.
   Replace the `new QueryClient(...)` block in `src/router.tsx`.
3. **B.5** — add `useNetwork()` and `useOfflineCapability()` hooks. The
   capability hook reads `'serviceWorker' in navigator`,
   `'sync' in registration`, and `navigator.storage.persist?.()` and is
   the single source of truth for `canQueueWrites`.
4. **C.1** — create `src/services/offline/db.ts` opening
   `eliteclass-offline` v1 with stores `outbox`, `dead_letter`,
   `snapshots`, `media_lru`, `realtime_cursors`, `kv`. All keys are
   `[ownerUserId, ...rest]`.
5. **C.2** — implement `outbox.ts`: `enqueue`, `peekDue`, `markInFlight`,
   `markSuccess`, `markRetry` (`min(300_000, 2_000 * 2^(attempts-1))`
   backoff, max 8 attempts), `markDead`, `retry`, `discard`, `count`,
   `purgeForUser`. Emits `change` on `drainSignal`.
6. **C.5** — `useOfflineMutation` hook: optimistic update +
   `outbox.enqueue` + `registration.sync.register('eliteclass-outbox')`
   when SW present, else foreground replay.
7. **C.8** — bootstrap a foreground replay loop (30s interval +
   `'online'` listener) gated on
   `useOfflineCapability().hasBackgroundSync === false`.
8. **G.1 / G.2** — when VitePWA ships re-enabled, switch `/rest/v1/*` GET
   to `StaleWhileRevalidate`, drop `BackgroundSyncPlugin`, add custom
   `'sync'` handler that calls into the shared outbox replay.

## Open issues

- **`cached-service.ts` and `edge-cache.ts` have zero callers today.** Phase 0
  classifies them `reuse-as-is`, but if they remain unused after this feature
  ships, a follow-up task should either wire SSR services through them or
  delete them. Out of scope for this spec.
- **Workbox queue migration window.** Replacing `eliteclass-offline-queue`
  drops any entries already queued at upgrade time (max 24h old). Confirmed
  acceptable in the decision above; flag for the Phase G release notes.
- **`storage-init.ts` naming overlap.** The design doc treated this as an
  early IndexedDB bootstrap point; the actual file only ensures Supabase
  Storage buckets exist. New IDB scaffolding lives in
  `src/services/offline/db.ts` instead — no change to `storage-init.ts`.
- **`refetchOnMount: false` default.** The current QueryClient sets
  `refetchOnMount: false`, which is good for offline UX (cached page renders
  immediately) but combined with persisted cache could surface very stale
  data after long offline periods. Mitigated by `RefreshButton` (Task D.4)
  and category-aware `staleTime` upgrades (Task B.2). No change required at
  this phase — flag for Phase D QA.
