import { create } from "zustand";
import { persist, devtools } from "zustand/middleware";
import type { User, Institute, UserRole } from "@/types";

export interface AuthState {
  user: User | null;
  institute: Institute | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setInstitute: (institute: Institute | null) => void;
  setLoading: (loading: boolean) => void;
  setAuthenticated: (auth: boolean) => void;
  login: (user: User, institute: Institute) => void;
  logout: () => void;
  getRole: () => UserRole | null;
  getInstituteId: () => string | null;
}

const authStoreImpl = persist<AuthState>(
  (set, get) => ({
    user: null,
    institute: null,
    isAuthenticated: false,
    isLoading: true,
    setUser: (user) => set({ user }),
    setInstitute: (institute) => set({ institute }),
    setLoading: (isLoading) => set({ isLoading }),
    setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
    login: (user, institute) =>
      set({ user, institute, isAuthenticated: true, isLoading: false }),
    logout: () => {
      // Clear persisted auth data on logout to prevent stale state in PWA
      try { sessionStorage.removeItem("eliteclass-profile-completed"); } catch {}
      set({ user: null, institute: null, isAuthenticated: false, isLoading: false });
    },
    getRole: () => get().user?.role ?? null,
    getInstituteId: () => get().user?.institute_id ?? null,
  }),
  {
    name: "eliteclass-auth",
    partialize: (state) => ({
      user: state.user,
      institute: state.institute,
      isAuthenticated: state.isAuthenticated,
    }) as unknown as AuthState,
    onRehydrateStorage: () => (state) => {
      // IMPORTANT: After rehydrating from localStorage, do NOT mark as
      // fully loaded. Keep isLoading = true so the AuthProvider can validate
      // the session with Supabase before showing any UI.
      // This prevents the "dummy user" bug in PWA where stale localStorage
      // data shows an old user before the session is verified.
      if (state) {
        state.isLoading = true; // Always start loading — AuthProvider resolves this
      }
    },
  },
);

export const useAuthStore = create<AuthState>()(
  import.meta.env.DEV ? (devtools(authStoreImpl, { name: "EliteClass Auth Store" }) as any) : authStoreImpl,
);
