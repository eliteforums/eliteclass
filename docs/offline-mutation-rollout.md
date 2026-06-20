# Offline Mutation Rollout Guide

Phase C wired two flows through the Sync Outbox:

- **`useMarkAttendanceOffline`** at `src/modules/attendance/hooks/useMarkAttendanceOffline.ts` — used by the admin attendance page.
- **`useSubmitAssignmentOffline`** at `src/modules/assignments/hooks/useSubmitAssignmentOffline.ts` — used by the student assignment dashboard for text/link submissions.

Phase D ships visibility (`SyncIndicator`, `OutboxPanel`, `RefreshButton`) and the runtime hooks (`useNetwork`, `useOfflineCapability`).

## Recipe for converting any write to offline-capable

For each existing write path that should survive offline:

1. Identify the table and operation:
   - Insert / upsert → `POST` to `/rest/v1/<table>?on_conflict=...` with `Prefer: resolution=merge-duplicates,return=representation`.
   - Update → `PATCH` to `/rest/v1/<table>?id=eq.<id>`.
   - Delete → `DELETE` to `/rest/v1/<table>?id=eq.<id>`.

2. Create a hook next to the existing service file:

```ts
import { useOfflineMutation } from "@/hooks/useOfflineMutation";
import { upsertOne } from "@/services/offline/snapshots";
import { useAuthStore } from "@/store/authStore";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";

export function useUpdateThingOffline() {
  return useOfflineMutation<UpdateThingVars>({
    toRequest: (vars) => ({
      url: `${SUPABASE_URL}/rest/v1/things?id=eq.${vars.id}`,
      method: "PATCH",
      body: { name: vars.name, updated_at: new Date().toISOString() },
    }),
    extraHeaders: { Prefer: "return=representation" },
    entityType: "things",
    entityId: (vars) => vars.id,
    invalidates: (vars) => [["things", vars.id], ["things", "list"]],
    optimisticUpdate: (_qc, vars) => {
      const ownerUserId = useAuthStore.getState().user?.id ?? "anon";
      void upsertOne("things", { id: vars.id, name: vars.name }, ownerUserId, "optimistic");
    },
  });
}
```

3. In the call site, swap the existing mutation for the new offline one. Branch on `useNetwork().isOnline` if the toast wording needs to differ between online and offline.

4. For online-only carve-outs (auth, AI calls, payments, geo-fenced attendance, file uploads > 5 MB), pass `onlineOnly: true` in the config — the hook will throw `OfflineFeatureError` with a clear message rather than queueing work that cannot drain.

## What's deliberately not wired (yet)

These write paths are still online-only and can be wired incrementally as
needed. None of them is blocking the offline-first ambition; each conversion
is a 30-line PR following the recipe above:

- Notification mark-read
- DM compose / send
- Profile / settings save
- Course progress (lesson complete)
- Batch / parent CRUD
- Manual exam grade edit (`update_exam_score`) — already routed through an
  RPC; can be wrapped by `useOfflineMutation` for offline replay if needed.

When converting, prefer:
- Stable composite ids for upserts (e.g. `${parentId}:${childId}`) so
  repeated optimistic updates land on the same snapshot row.
- `extraHeaders` for any non-default `Prefer` directive.
- Per-row `entityId` granularity over bulk batches — gives every mutation
  its own retry / dead-letter lifecycle.

## Visibility

- **`SyncIndicator`** in the topbar shows live state (`All synced`,
  `N pending`, `Offline — N queued`, `Offline — queueing disabled`).
- Click the indicator to open **`OutboxPanel`** — pending and dead-letter
  rows with retry / discard.
- **`RefreshButton`** on cached pages invalidates a list of query keys and
  drains the outbox.

## Failure modes

- Network blip during drain → entry stays in outbox, retries with
  exponential backoff (2s → 5min, max 8 attempts).
- 4xx other than 408/429 → entry goes to the dead-letter store; user can
  retry or discard from `OutboxPanel`.
- PWA disabled (Vercel build) → reads still work via the persisted React
  Query cache; writes throw `OfflineFeatureError("offline queue
  unavailable…")` rather than silently dropping.
