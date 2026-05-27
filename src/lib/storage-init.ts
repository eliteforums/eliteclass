// Storage bucket initialization — disabled (buckets are created manually in Supabase Dashboard)

export async function ensureStorageBuckets(): Promise<void> {
  // Buckets are pre-created in Supabase Dashboard > Storage.
  // No auto-provisioning needed at runtime.
  return;
}

export default ensureStorageBuckets;
