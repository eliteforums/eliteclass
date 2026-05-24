// ---------------------------------------------------------------------------
// EduOS — Supabase Client
//
// WHY THIS FILE MUST NEVER THROW AT MODULE LOAD TIME
// ---------------------------------------------------------------------------
//
// In TanStack Start (SSR), every import in the component tree is evaluated
// before any request handler or error boundary runs. A throw during module
// evaluation unwinds the entire import chain and crashes the SSR process.
// No try/catch in server.ts can intercept it — it happens before the server
// even starts handling the request.
//
// The original code did:
//   if (!supabaseUrl) throw new Error(...)  ← kills SSR entirely
//
// The fix: never throw at the module level. Instead:
//   • Warn loudly in the browser console during development.
//   • Export `supabase` as `SupabaseClient | null` — null when not configured.
//   • Let call-site guards (auth.service.ts, AuthProvider) handle the null
//     case with structured error responses instead of unhandled exceptions.
//
// CONFIGURATION
// Create a .env file in the project root (next to package.json):
//
//   VITE_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
//   VITE_APP_URL=http://localhost:3000
//
// ---------------------------------------------------------------------------

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseFetch } from "@/lib/safe-fetch";

declare global {
  // eslint-disable-next-line no-var
  var __EDUOS_SUPABASE_CLIENT__: SupabaseClient | null | undefined;
  // eslint-disable-next-line no-var
  var __EDUOS_SUPABASE_ADMIN_CLIENT__: SupabaseClient | null | undefined;
}

// ── Environment variable detection ──────────────────────────────────────────
// Typed as `string | undefined` — Vite replaces VITE_* values at build time,
// but they will be `undefined` if the .env file doesn't exist yet.

const supabaseUrl: string | undefined = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey: string | undefined = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceKey: string | undefined = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

// ── Configuration flag ───────────────────────────────────────────────────────
// Export this so AuthProvider, guards, and tests can check readiness without
// importing the client itself.

export const isSupabaseConfigured: boolean = Boolean(supabaseUrl && supabaseAnonKey);
export const isSupabaseAdminConfigured: boolean = Boolean(supabaseUrl && supabaseServiceKey);

// ── Development warning ──────────────────────────────────────────────────────
// Only emitted in dev mode and only in the browser (not during SSR stdout).
// Using console.warn (not throw) so SSR continues rendering normally.

if (!isSupabaseConfigured && import.meta.env.DEV && typeof window !== "undefined") {
  console.warn(
    [
      "",
      "┌─────────────────────────────────────────────────────────────────┐",
      "│  ⚠  EduOS — Supabase credentials not found                      │",
      "│                                                                 │",
      "│  Create a .env file in the project root:                       │",
      "│                                                                 │",
      "│    VITE_SUPABASE_URL=https://xxxx.supabase.co                  │",
      "│    VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...     │",
      "│    VITE_APP_URL=http://localhost:3000                           │",
      "│                                                                 │",
      "│  Auth features are disabled until this is resolved.            │",
      "│  Restart the dev server after adding the file.                 │",
      "└─────────────────────────────────────────────────────────────────┘",
      "",
    ].join("\n"),
  );
}

// ── Supabase client ──────────────────────────────────────────────────────────
// `null` when env vars are missing — the app still boots and all routes still
// render. Call-site guards in auth.service.ts and AuthProvider return structured
// "not configured" errors instead of crashing when supabase is null.
//
// The non-null assertion (!!) below is safe because we checked isSupabaseConfigured
// above — if it's true, both strings are defined.

export const supabase: SupabaseClient | null =
  globalThis.__EDUOS_SUPABASE_CLIENT__ ??
  (isSupabaseConfigured
    ? createClient(supabaseUrl!, supabaseAnonKey!, {
        auth: {
          /** Silently refresh the JWT before it expires */
          autoRefreshToken: true,
          /** Persist the session in localStorage across page refreshes */
          persistSession: true,
          /** Detect OAuth / magic-link tokens from the URL on load */
          detectSessionInUrl: true,
        },
        global: {
          fetch: createSupabaseFetch(),
        },
      })
    : null);

if (globalThis.__EDUOS_SUPABASE_CLIENT__ === undefined) {
  globalThis.__EDUOS_SUPABASE_CLIENT__ = supabase;
}

/**
 * Admin client used for sensitive operations (e.g. creating users without
 * requiring email confirmation, managing RBAC roles).
 *
 * This client uses the service_role key and bypasses Row Level Security (RLS).
 * In TanStack Start, this should ONLY be imported and used within server
 * functions (createServerFn) to avoid leaking the service_role key to the browser.
 */
export const supabaseAdmin: SupabaseClient | null =
  globalThis.__EDUOS_SUPABASE_ADMIN_CLIENT__ ??
  (isSupabaseAdminConfigured
    ? createClient(supabaseUrl!, supabaseServiceKey!, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        global: {
          fetch: createSupabaseFetch(),
        },
      })
    : null);

if (globalThis.__EDUOS_SUPABASE_ADMIN_CLIENT__ === undefined) {
  globalThis.__EDUOS_SUPABASE_ADMIN_CLIENT__ = supabaseAdmin;
}

// Re-export the type so consumers don't need to import from supabase-js directly.
export type { SupabaseClient } from "@supabase/supabase-js";
