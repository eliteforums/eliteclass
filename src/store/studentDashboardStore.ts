import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import type { ParentPortalChildSnapshot, StudentDashboardData } from "@/types";

export interface StudentDashboardState {
  dashboard: StudentDashboardData | null;
  studentId: string | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: string | null;
  parentChildren: Record<string, ParentPortalChildSnapshot>;
  parentSelectedChildId: string | null;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setDashboard: (studentId: string, dashboard: StudentDashboardData) => void;
  resetDashboard: () => void;
  setParentChildSnapshot: (childId: string, snapshot: ParentPortalChildSnapshot | null) => void;
  setParentSelectedChildId: (childId: string | null) => void;
}

export const useStudentDashboardStore = create<StudentDashboardState>()(
  devtools(
    persist(
      (set) => ({
        dashboard: null,
        studentId: null,
        isLoading: true,
        error: null,
        lastUpdated: null,
        parentChildren: {},
        parentSelectedChildId: null,
        setLoading: (isLoading) => set({ isLoading }, false, "studentDashboard/setLoading"),
        setError: (error) => set({ error }, false, "studentDashboard/setError"),
        setDashboard: (studentId, dashboard) =>
          set(
            {
              dashboard,
              studentId,
              isLoading: false,
              error: null,
              lastUpdated: new Date().toISOString(),
            },
            false,
            "studentDashboard/setDashboard",
          ),
        resetDashboard: () =>
          set(
            {
              dashboard: null,
              studentId: null,
              isLoading: true,
              error: null,
              lastUpdated: null,
            },
            false,
            "studentDashboard/resetDashboard",
          ),
        setParentChildSnapshot: (childId, snapshot) =>
          set((state) => ({
            parentChildren: snapshot
              ? { ...state.parentChildren, [childId]: snapshot }
              : Object.fromEntries(Object.entries(state.parentChildren).filter(([id]) => id !== childId)),
            parentSelectedChildId: state.parentSelectedChildId ?? childId,
          })),
        setParentSelectedChildId: (childId) => set({ parentSelectedChildId: childId }),
      }),
      {
        name: "eduos-student-dashboard",
        partialize: (state) => ({
          dashboard: state.dashboard,
          studentId: state.studentId,
          lastUpdated: state.lastUpdated,
          parentChildren: state.parentChildren,
          parentSelectedChildId: state.parentSelectedChildId,
        }),
      },
    ),
    { name: "EduOS Student Dashboard Store" },
  ),
);
