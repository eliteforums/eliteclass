import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { Institute } from "@/types";

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface InstituteState {
  // ── Data ──────────────────────────────────────────────────────────────────
  /** Full list — used primarily by super_admin views */
  institutes: Institute[];
  /** The institute the currently-authenticated user belongs to */
  currentInstitute: Institute | null;
  isLoading: boolean;
  error: string | null;

  // ── Setters ───────────────────────────────────────────────────────────────
  setInstitutes: (institutes: Institute[]) => void;
  setCurrentInstitute: (institute: Institute | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // ── CRUD helpers (optimistic updates before server confirmation) ───────────
  /** Append a newly-created institute to the list */
  addInstitute: (institute: Institute) => void;
  /** Merge partial data into an existing institute by id */
  updateInstitute: (id: string, data: Partial<Institute>) => void;
  /** Remove an institute from the local list by id */
  removeInstitute: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useInstituteStore = create<InstituteState>()(
  devtools(
    (set, get) => ({
      // ── Initial state ───────────────────────────────────────────────────
      institutes: [],
      currentInstitute: null,
      isLoading: false,
      error: null,

      // ── Setters ─────────────────────────────────────────────────────────
      setInstitutes: (institutes) => set({ institutes }, false, "institute/setInstitutes"),

      setCurrentInstitute: (currentInstitute) =>
        set({ currentInstitute }, false, "institute/setCurrentInstitute"),

      setLoading: (isLoading) => set({ isLoading }, false, "institute/setLoading"),

      setError: (error) => set({ error }, false, "institute/setError"),

      // ── CRUD ─────────────────────────────────────────────────────────────
      addInstitute: (institute) =>
        set({ institutes: [...get().institutes, institute] }, false, "institute/addInstitute"),

      updateInstitute: (id, data) =>
        set(
          {
            institutes: get().institutes.map((inst) =>
              inst.id === id ? { ...inst, ...data } : inst,
            ),
            // Also patch currentInstitute if it's the same record
            currentInstitute:
              get().currentInstitute?.id === id
                ? { ...get().currentInstitute!, ...data }
                : get().currentInstitute,
          },
          false,
          "institute/updateInstitute",
        ),

      removeInstitute: (id) =>
        set(
          {
            institutes: get().institutes.filter((inst) => inst.id !== id),
            currentInstitute: get().currentInstitute?.id === id ? null : get().currentInstitute,
          },
          false,
          "institute/removeInstitute",
        ),
    }),
    { name: "EduOS Institute Store" },
  ),
);
