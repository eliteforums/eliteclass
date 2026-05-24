// ---------------------------------------------------------------------------
// EduOS — Dashboard Overview (/dashboard/)
//
// This is the index (home) page for the /dashboard layout.
// It renders inside the parent layout's <Outlet /> so it gets the
// DashboardSidebar + Topbar for free — no layout wrapper needed here.
// ---------------------------------------------------------------------------

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { StatCards } from "@/components/dashboard/StatCards";
import { RecentTable } from "@/components/dashboard/RecentTable";
import { AIPanel } from "@/components/dashboard/AIPanel";
import { useAuthStore } from "@/store/authStore";
import { getStudentsByInstitute } from "@/services/student.service";
import { getStaffByInstitute } from "@/services/staff.service";
import type { Student } from "@/types";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({
    meta: [
      { title: "Dashboard — EduOS" },
      { name: "description", content: "Premium control center for your institute." },
    ],
  }),
  component: DashboardOverview,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ---------------------------------------------------------------------------
// Page component — pure content, no layout wrappers
// ---------------------------------------------------------------------------
function DashboardOverview() {
  const { user, institute } = useAuthStore();

  const [studentCount, setStudentCount] = useState<number | null>(null);
  const [staffCount, setStaffCount] = useState<number | null>(null);
  const [recentStudents, setRecentStudents] = useState<Student[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    const instituteId = user?.institute_id;
    if (!instituteId) {
      setStatsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadStats() {
      setStatsLoading(true);
      setStatsError(null);
      // OPTIMIZATION: Only fetch count if we don't need the full list for stats
      try {
        const [studentsResult, staffResult] = await Promise.all([
          getStudentsByInstitute(instituteId!),
          getStaffByInstitute(instituteId!),
        ]);

        if (cancelled) return;

        if (studentsResult.success && studentsResult.data) {
          setStudentCount(studentsResult.data.length);
          setRecentStudents(studentsResult.data.slice(0, 5));
        } else {
          setStudentCount(0);
          setRecentStudents([]);
          setStatsError(studentsResult.error ?? "Failed to load students.");
        }

        if (staffResult.success && staffResult.data) {
          setStaffCount(staffResult.data.length);
        } else {
          setStaffCount(0);
          setStatsError((current) => current ?? staffResult.error ?? "Failed to load staff.");
        }
      } catch (err) {
        if (!cancelled) {
          setStudentCount(0);
          setStaffCount(0);
          setRecentStudents([]);
          setStatsError(err instanceof Error ? err.message : "Failed to load dashboard stats.");
        }
      } finally {
        if (!cancelled) {
          setStatsLoading(false);
        }
      }
    }

    loadStats();
    return () => {
      cancelled = true;
    };
  }, [user?.institute_id]);

  const firstName = user?.name?.split(" ")[0] ?? "there";
  const instituteName = institute?.name ?? "your institute";

  return (
    <>
      {/* Greeting */}
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Overview
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
          {getGreeting()}, <span className="text-gradient">{firstName}</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here's what's happening across {instituteName} today.
        </p>
      </div>

      {/* Live stat cards */}
      <StatCards studentCount={studentCount} staffCount={staffCount} isLoading={statsLoading} />

      {!statsLoading && statsError ? (
        <div className="mt-6 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {statsError}
        </div>
      ) : null}

      {/* Recent admissions + AI panel */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentTable students={recentStudents} isLoading={statsLoading} />
        </div>
        <div>
          <AIPanel />
        </div>
      </div>
    </>
  );
}
