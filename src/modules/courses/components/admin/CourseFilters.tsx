// ---------------------------------------------------------------------------
// CourseFilters — search + status + difficulty filter bar for the admin/staff
// course management pages.
//
// Search input is debounced internally (300 ms) to avoid hammering the API
// on every keystroke while keeping the external state in sync.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Search, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LmsCourseStatus, LmsDifficulty } from "@/types";

export interface CourseFiltersProps {
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: LmsCourseStatus | "all";
  onStatusChange: (v: LmsCourseStatus | "all") => void;
  difficultyFilter: LmsDifficulty | "all";
  onDifficultyChange: (v: LmsDifficulty | "all") => void;
  onCreateCourse: () => void;
  role: "admin" | "staff";
}

export function CourseFilters({
  search,
  onSearchChange,
  statusFilter,
  onStatusChange,
  difficultyFilter,
  onDifficultyChange,
  onCreateCourse,
  role: _role,
}: CourseFiltersProps) {
  // Local controlled value for the input — changes are debounced before
  // being surfaced to the parent via onSearchChange.
  const [localSearch, setLocalSearch] = useState(search);

  // Sync if parent resets search externally (e.g. clearing all filters)
  useEffect(() => {
    if (search === "") setLocalSearch("");
  }, [search]);

  // Debounce: wait 300 ms after the user stops typing before calling parent.
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchChange(localSearch);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localSearch]);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      {/* Search */}
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          placeholder="Search courses..."
          className="pl-9"
          aria-label="Search courses"
        />
      </div>

      {/* Status filter */}
      <Select
        value={statusFilter}
        onValueChange={(v) => onStatusChange(v as LmsCourseStatus | "all")}
      >
        <SelectTrigger className="w-full sm:w-40" aria-label="Filter by status">
          <SelectValue placeholder="All Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="draft">Draft</SelectItem>
          <SelectItem value="published">Published</SelectItem>
          <SelectItem value="archived">Archived</SelectItem>
        </SelectContent>
      </Select>

      {/* Difficulty filter */}
      <Select
        value={difficultyFilter}
        onValueChange={(v) => onDifficultyChange(v as LmsDifficulty | "all")}
      >
        <SelectTrigger className="w-full sm:w-44" aria-label="Filter by difficulty">
          <SelectValue placeholder="All Levels" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Levels</SelectItem>
          <SelectItem value="beginner">Beginner</SelectItem>
          <SelectItem value="intermediate">Intermediate</SelectItem>
          <SelectItem value="advanced">Advanced</SelectItem>
          <SelectItem value="expert">Expert</SelectItem>
        </SelectContent>
      </Select>

      {/* New Course CTA */}
      <Button onClick={onCreateCourse} className="shrink-0 gap-1.5">
        <Plus className="h-4 w-4" aria-hidden="true" />
        New Course
      </Button>
    </div>
  );
}
