import { supabase } from "./supabase";

const BUCKETS = ["exam-proctoring", "avatars", "documents"];

/**
 * Ensures all required storage buckets exist.
 * Creates them as public buckets if they don't exist.
 * Runs silently — failures are logged but don't block the app.
 */
export async function ensureStorageBuckets(): Promise<void> {
  if (!supabase) return;

  try {
    const { data: existingBuckets } = await supabase.storage.listBuckets();
    const existingNames = new Set((existingBuckets ?? []).map((b) => b.name));

    for (const bucketName of BUCKETS) {
      if (!existingNames.has(bucketName)) {
        const { error } = await supabase.storage.createBucket(bucketName, {
          public: true, // Public so signed URLs work reliably
          fileSizeLimit: 10485760, // 10MB limit
          allowedMimeTypes: ["image/jpeg", "image/png", "image/jpg", "application/pdf"],
        });
        if (error) {
          console.warn(`[storage-init] Failed to create bucket "${bucketName}":`, error.message);
        } else {
          console.log(`[storage-init] Created bucket "${bucketName}"`);
        }
      }
    }
  } catch (err) {
    console.warn("[storage-init] Bucket check failed:", err);
  }
}

export default ensureStorageBuckets;
