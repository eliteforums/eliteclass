// ---------------------------------------------------------------------------
// Conflicts — last-writer-wins resolver + offline_conflicts audit writer
// ---------------------------------------------------------------------------
//
// Called from the outbox replay loop when a server response indicates the
// row was modified after the client's `baseUpdatedAt`. The client payload
// wins (LWW per Req 14.1); we record both payloads to the
// `offline_conflicts` table so admins can review them.
// ---------------------------------------------------------------------------

import { supabase } from "@/lib/supabase";

export interface ConflictRecord {
  entityType: string;
  entityId: string;
  actorUserId: string;
  clientBaseUpdatedAt: string | null;
  serverUpdatedAt: string;
  clientPayload: unknown;
  serverPayload: unknown;
}

/**
 * Returns true if the server's `updated_at` is strictly newer than the
 * client's `baseUpdatedAt`. `null` client base is treated as "stale" — any
 * server timestamp wins.
 */
export function isStale(
  clientBase: string | null,
  serverUpdated: string | null | undefined,
): boolean {
  if (!serverUpdated) return false;
  if (!clientBase) return true;
  return new Date(serverUpdated).getTime() > new Date(clientBase).getTime();
}

/**
 * Persist a conflict to the `offline_conflicts` table. The current actor is
 * always the resolver (LWW means the client's writer is also the resolver).
 *
 * Best-effort: failures are logged but never propagated, so a conflict log
 * outage does not block the outbox drain.
 */
export async function recordAndOverwrite(record: ConflictRecord): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("offline_conflicts").insert({
      entity_type: record.entityType,
      entity_id: record.entityId,
      actor_user_id: record.actorUserId,
      client_base_updated_at: record.clientBaseUpdatedAt,
      server_updated_at: record.serverUpdatedAt,
      client_payload: record.clientPayload as object,
      server_payload: record.serverPayload as object,
      resolution: "last-writer-wins",
      resolver_user_id: record.actorUserId,
    });
  } catch (err) {
    // best-effort
    if (typeof console !== "undefined") {
      console.warn("[offline] failed to record conflict", err);
    }
  }
}
