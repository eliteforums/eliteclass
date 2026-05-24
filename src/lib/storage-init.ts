import { LMS_STORAGE_BUCKETS } from "@/modules/courses/constants/storage";

function getEnv(name: string): string | undefined {
  if (typeof process === "undefined" || !process.env) return undefined;
  return process.env[name];
}

const SERVICE_KEY = getEnv("VITE_SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_URL = getEnv("VITE_SUPABASE_URL");

async function fetchJson(url: string, opts: RequestInit = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (e) {
    data = text;
  }
  return { status: res.status, data };
}

export async function ensureStorageBuckets(): Promise<void> {
  try {
    if (!SERVICE_KEY || !SUPABASE_URL) {
      // Not configured in environment (likely in client-only runs or preview without secrets) — skip.
      // eslint-disable-next-line no-console
      console.warn("Service role key or Supabase URL not set; skipping storage bucket init.");
      return;
    }

    const headers = {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    };

    // Check existing buckets
    const listUrl = `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/buckets`;
    const listRes = await fetchJson(listUrl, { headers });
    if (listRes.status !== 200 || !Array.isArray(listRes.data)) {
      // If storage service not enabled or route missing, warn and continue.
      // eslint-disable-next-line no-console
      console.warn("Could not list storage buckets — status:", listRes.status, "data:", listRes.data);
    }

    const existing = Array.isArray(listRes.data) ? listRes.data.map((b: any) => b.id) : [];

    // Desired buckets from constants
    const desired = new Set(Object.values(LMS_STORAGE_BUCKETS));

    for (const bucketId of desired) {
      if (existing.includes(bucketId)) continue;

      // Create bucket via Storage Admin API
      const createUrl = `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/buckets`;
      const body = JSON.stringify({ id: bucketId, name: bucketId, public: false });
      const res = await fetchJson(createUrl, { method: "POST", headers, body });
      if (res.status === 201 || res.status === 200) {
        // created
        // eslint-disable-next-line no-console
        console.log(`Storage bucket created: ${bucketId}`);
      } else if (res.status === 409) {
        // already exists (race)
        // eslint-disable-next-line no-console
        console.log(`Storage bucket already exists (race): ${bucketId}`);
      } else {
        // warn but continue
        // eslint-disable-next-line no-console
        console.warn(`Failed to create bucket ${bucketId}:`, res.status, res.data);
      }
    }
  } catch (error) {
    // Never let bucket provisioning crash SSR or the request handler.
    // eslint-disable-next-line no-console
    console.warn("Storage bucket initialization skipped due to runtime error:", error);
    return;
  }
}

export default ensureStorageBuckets;
