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
    logout: () =>
      set({ user: null, institute: null, isAuthenticated: false, isLoading: false }),
    getRole: () => get().user?.role ?? null,
    getInstituteId: () => get().user?.institute_id ?? null,
  }),
  {
    name: "eduos-auth",
    partialize: (state) => ({
      user: state.user,
      institute: state.institute,
      isAuthenticated: state.isAuthenticated,
    }),
    onRehydrateStorage: () => (state) => {
      if (state?.isAuthenticated) {
        state.isLoading = false;
      }
    },
  },
);

export const useAuthStore = create<AuthState>()(
  import.meta.env.DEV ? devtools(authStoreImpl, { name: "EduOS Auth Store" }) : authStoreImpl,
);
