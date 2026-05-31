import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabase } from "@/lib/supabase";

interface AIKeyState {
  apiKey: string | null;
  isKeyValid: boolean;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  setKeyValid: (valid: boolean) => void;
  syncFromDb: () => Promise<void>;
}

export const useAIKeyStore = create<AIKeyState>()(
  persist(
    (set, get) => ({
      apiKey: null,
      isKeyValid: true,
      setApiKey: (key) => {
        set({ apiKey: key, isKeyValid: true });
        // Also save to DB for cross-device persistence
        saveKeyToDb(key);
      },
      clearApiKey: () => {
        set({ apiKey: null, isKeyValid: true });
        saveKeyToDb(null);
      },
      setKeyValid: (valid) => set({ isKeyValid: valid }),
      syncFromDb: async () => {
        // Load key from DB if localStorage is empty
        if (get().apiKey) return; // Already have a key locally
        const key = await loadKeyFromDb();
        if (key) {
          set({ apiKey: key, isKeyValid: true });
        }
      },
    }),
    { name: "eliteclass-groq-key" }
  )
);

// ── DB persistence helpers (fire-and-forget) ─────────────────────────────────

async function saveKeyToDb(key: string | null): Promise<void> {
  if (!supabase) return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Store in user metadata (persists across devices)
    await supabase.auth.updateUser({
      data: { groq_api_key: key },
    });
  } catch {
    // Silent — localStorage is the primary store, DB is backup
  }
}

async function loadKeyFromDb(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    return (user.user_metadata?.groq_api_key as string) ?? null;
  } catch {
    return null;
  }
}
