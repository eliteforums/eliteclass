import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AIKeyState {
  apiKey: string | null;
  isKeyValid: boolean;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  setKeyValid: (valid: boolean) => void;
}

export const useAIKeyStore = create<AIKeyState>()(
  persist(
    (set) => ({
      apiKey: null,
      isKeyValid: true,
      setApiKey: (key) => set({ apiKey: key, isKeyValid: true }),
      clearApiKey: () => set({ apiKey: null, isKeyValid: true }),
      setKeyValid: (valid) => set({ isKeyValid: valid }),
    }),
    { name: "eliteclass-groq-key" }
  )
);
