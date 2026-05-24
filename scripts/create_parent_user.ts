/*
Server-side helper to create a Supabase auth user (requires service_role key).
Run on a secure server or locally with env var SUPABASE_SERVICE_ROLE_KEY set.

Usage (node + ts-node or compile to JS):
  SUPABASE_URL=https://xyz.supabase.co SUPABASE_SERVICE_ROLE_KEY=... ts-node scripts/create_parent_user.ts "parent@example.com" "TemporaryP@ssw0rd" '{"role":"parent","institute_id":"inst_123"}'

This script calls `supabase.auth.admin.createUser()` and prints the result.
*/

import { createClient } from "@supabase/supabase-js";

async function main() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.");
    process.exit(1);
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: node create_parent_user.js <email> <password> [json_metadata]");
    process.exit(1);
  }

  const [email, password, metadataJson] = args;
  let metadata: Record<string, unknown> | undefined = undefined;
  try {
    if (metadataJson) metadata = JSON.parse(metadataJson);
  } catch (err) {
    console.error("Failed to parse metadata JSON:", err);
    process.exit(1);
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });

  if (error) {
    console.error("Error creating user:", error);
    process.exit(2);
  }

  console.log("Created auth user:", data);
}

main().catch((err) => {
  console.error(err);
  process.exit(99);
});
