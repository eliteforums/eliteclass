// ---------------------------------------------------------------------------
// EduOS — Admin: Schedule Management (/dashboard/admin/schedule)
// ---------------------------------------------------------------------------

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useMountedRef } from "@/hooks/useMountedRef";
import { Calendar, Copy, Download, Plus, RefreshCw, Send } from "lucide-react";
import { toast } from "sonner";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthStore } from "@/store/authStore";
import { getBatchesByInstitute } from "@/services/batch.service";
import { getStaffByInstitute } from "@/services/staff.service";
import {
  createSchedule,
  createScheduleException,
  createRoom,
  createSubject,
  deleteSchedule,
  deleteScheduleException,
  duplicateWeekSchedules,
  getRooms,
  getScheduleExceptions,
  getSchedules,
  getSectionsByBatch,
  getSubjects,
  publishBatchSchedule,
  updateSchedule,
} from "@/services/schedule.service";
import { WeeklyTimetableGrid } from "@/modules/schedule/components/WeeklyTimetableGrid";
import { DailyScheduleView } from "@/modules/schedule/components/DailyScheduleView";
import { ScheduleSlotFormModal } from "@/modules/schedule/components/ScheduleSlotFormModal";
import { ScheduleSkeleton } from "@/modules/schedule/components/ScheduleSkeleton";
import {
  downloadCsv,
  exportSchedulesToCsv,
  filterSchedulesForToday,
} from "@/modules/schedule/utils/scheduleHelpers";
import type { ScheduleSlotSchema } from "@/modules/schedule/validations";
import type { Batch, Room, Schedule, ScheduleException, Section, Staff, Subject } from "@/types";

export const Route = createFileRoute("/dashboard/admin/schedule/")({
  head: () => ({ meta: [{ title: "Schedule — EduOS" }] }),
  component: AdminSchedulePage,
});

const INPUT_CLASS =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

function getBatchItems(data: unknown): Batch[] {
  if (Array.isArray(data)) return data as Batch[];

  if (data && typeof data === "object" && "items" in data) {
    const items = (data as { items?: unknown }).items;
    if (Array.isArray(items)) return items as Batch[];
  }

  return [];
}

function AdminSchedulePage() {
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? "";
  const canManageSchedule = user?.role === "admin" || user?.role === "super_admin";

  const [batches, setBatches] = useState<Batch[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);

  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [filterTeacher, setFilterTeacher] = useState("");
  const [filterDay, setFilterDay] = useState<string>("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const mounted = useMountedRef();
  const initialBatchSet = useRef(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [newSubject, setNewSubject] = useState("");
  const [newRoom, setNewRoom] = useState("");
  const [newExceptionTitle, setNewExceptionTitle] = useState("");
  const [newExceptionDate, setNewExceptionDate] = useState("");

  const loadMeta = useCallback(async () => {
    if (!instituteId) return;
    const [b, s, r, st] = await Promise.all([
      getBatchesByInstitute(instituteId),
      getSubjects(instituteId),
      getRooms(instituteId),
      getStaffByInstitute(instituteId),
    ]);
    if (b.success && b.data) {
      const batchItems = getBatchItems(b.data);
      setBatches(batchItems);
      if (!initialBatchSet.current && batchItems[0]) {
        initialBatchSet.current = true;
        setSelectedBatchId(batchItems[0].id);
      }
    } else {
      setBatches([]);
    }
    if (s.success && s.data) setSubjects(s.data);
    if (r.success && r.data) setRooms(r.data);
    if (st.success && st.data) setStaff(st.data);
  }, [instituteId]);

  const loadSchedules = useCallback(async () => {
    if (!instituteId || !mounted.current) return;
    setIsLoading(true);
    const filters = {
      batchId: selectedBatchId || undefined,
      teacherId: filterTeacher || undefined,
      dayOfWeek: filterDay !== "" ? Number(filterDay) : undefined,
      search: debouncedSearch || undefined,
    };
    try {
      const [schedRes, exRes] = await Promise.all([
        getSchedules(instituteId, filters),
        getScheduleExceptions(instituteId, selectedBatchId || undefined),
      ]);
      if (!mounted.current) return;
      if (schedRes.success && schedRes.data) setSchedules(schedRes.data);
      else setSchedules([]);
      if (exRes.success && exRes.data) setExceptions(exRes.data);
    } finally {
      if (mounted.current) setIsLoading(false);
    }
  }, [instituteId, selectedBatchId, filterTeacher, filterDay, debouncedSearch, mounted]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    void loadSchedules();
  }, [loadSchedules]);

  const handleBatchChange = useCallback(async (batchId: string) => {
    if (!batchId) {
      setSections([]);
      return;
    }
    const res = await getSectionsByBatch(batchId);
    if (res.success && res.data) setSections(res.data);
  }, []);

  const filteredToday = useMemo(() => filterSchedulesForToday(schedules), [schedules]);

  async function handleSlotSubmit(values: ScheduleSlotSchema) {
    if (!instituteId) return;
    setIsSubmitting(true);
    setFormError(null);

    const payload = {
      institute_id: instituteId,
      batch_id: values.batch_id,
      section_id: values.section_id || null,
      subject_id: values.subject_id || null,
      teacher_id: values.teacher_id || null,
      room_id: values.room_id || null,
      day_of_week: values.day_of_week,
      start_time: values.start_time.length === 5 ? `${values.start_time}:00` : values.start_time,
      end_time: values.end_time.length === 5 ? `${values.end_time}:00` : values.end_time,
      type: values.type,
      title: values.title || null,
      notes: values.notes || null,
    };

    const result = editing
      ? await updateSchedule(editing.id, instituteId, payload)
      : await createSchedule(payload);

    setIsSubmitting(false);
    if (result.success) {
      toast.success(editing ? "Schedule updated" : "Schedule slot added");
      setModalOpen(false);
      setEditing(null);
      void loadSchedules();
    } else {
      setFormError(result.error ?? "Failed to save schedule.");
    }
  }

  async function handleDelete(slot: Schedule) {
    if (!confirm("Delete this schedule slot?")) return;
    const result = await deleteSchedule(slot.id);
    if (result.success) {
      toast.success("Slot deleted");
      void loadSchedules();
    } else {
      toast.error(result.error ?? "Delete failed");
    }
  }

  async function handlePublish() {
    if (!instituteId || !selectedBatchId) {
      toast.error("Select a batch first");
      return;
    }
    const result = await publishBatchSchedule(instituteId, selectedBatchId);
    if (result.success) {
      toast.success(`Published ${result.data?.published ?? 0} slots`);
      void loadSchedules();
    } else {
      toast.error(result.error ?? "Publish failed");
    }
  }

  async function handleDuplicate() {
    if (!instituteId || !selectedBatchId) return;
    const result = await duplicateWeekSchedules(instituteId, selectedBatchId);
    if (result.success) {
      toast.success(`Duplicated ${result.data?.duplicated ?? 0} slots as drafts`);
      void loadSchedules();
    } else {
      toast.error(result.error ?? "Duplicate failed");
    }
  }

  function handleExport() {
    downloadCsv(exportSchedulesToCsv(schedules), `timetable-${selectedBatchId || "all"}.csv`);
    toast.success("Schedule exported");
  }

  async function handleAddSubject() {
    if (!instituteId || !newSubject.trim()) return;
    const result = await createSubject({ institute_id: instituteId, name: newSubject.trim() });
    if (result.success) {
      toast.success("Subject added");
      setNewSubject("");
      void loadMeta();
    } else {
      toast.error(result.error ?? "Failed to add subject");
    }
  }

  async function handleAddRoom() {
    if (!instituteId || !newRoom.trim()) return;
    const result = await createRoom({ institute_id: instituteId, room_name: newRoom.trim() });
    if (result.success) {
      toast.success("Room added");
      setNewRoom("");
      void loadMeta();
    } else {
      toast.error(result.error ?? "Failed to add room");
    }
  }

  async function handleAddException() {
    if (!instituteId || !newExceptionTitle.trim() || !newExceptionDate) return;
    const result = await createScheduleException({
      institute_id: instituteId,
      batch_id: selectedBatchId || null,
      exception_date: newExceptionDate,
      type: "holiday",
      title: newExceptionTitle.trim(),
    });
    if (result.success) {
      toast.success("Exception added");
      setNewExceptionTitle("");
      setNewExceptionDate("");
      void loadSchedules();
    } else {
      toast.error(result.error ?? "Failed to add exception");
    }
  }

  return (
    <ProtectedRoute allowedRoles={["admin", "staff", "super_admin"]}>
      <PageHeader
        title="Schedule Management"
        description="Create timetables, assign teachers and rooms, detect conflicts, and publish schedules."
      />

      {!canManageSchedule && (
        <div className="mb-6 rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          You are viewing schedule in read-only mode. Editing, publishing, and setup actions are
          available to admins only.
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        <select
          value={selectedBatchId}
          onChange={(e) => setSelectedBatchId(e.target.value)}
          className={`${INPUT_CLASS} max-w-xs`}
        >
          <option value="">All batches</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          value={filterTeacher}
          onChange={(e) => setFilterTeacher(e.target.value)}
          className={`${INPUT_CLASS} max-w-[180px]`}
        >
          <option value="">All teachers</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.user?.name}
            </option>
          ))}
        </select>
        <select
          value={filterDay}
          onChange={(e) => setFilterDay(e.target.value)}
          className={`${INPUT_CLASS} max-w-[140px]`}
        >
          <option value="">All days</option>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search schedules…"
          className="max-w-xs"
        />
        <button
          type="button"
          onClick={() => void loadSchedules()}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {canManageSchedule && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormError(null);
              setModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Add slot
          </button>
          <button
            type="button"
            onClick={() => void handlePublish()}
            disabled={!selectedBatchId}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            Publish batch
          </button>
          <button
            type="button"
            onClick={() => void handleDuplicate()}
            disabled={!selectedBatchId}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            <Copy className="h-4 w-4" />
            Duplicate week
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      )}

      <Tabs defaultValue={canManageSchedule ? "week" : "today"}>
        <TabsList>
          <TabsTrigger value="week">Weekly grid</TabsTrigger>
          <TabsTrigger value="today">Today</TabsTrigger>
          {canManageSchedule && <TabsTrigger value="setup">Rooms & subjects</TabsTrigger>}
          {canManageSchedule && <TabsTrigger value="exceptions">Holidays & events</TabsTrigger>}
        </TabsList>

        <TabsContent value="week" className="mt-4 space-y-4">
          {isLoading ? (
            <ScheduleSkeleton />
          ) : schedules.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
              <Calendar className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                No schedule slots yet. Add your first slot.
              </p>
            </div>
          ) : (
            <WeeklyTimetableGrid
              schedules={schedules}
              editable
              onEdit={(s) => {
                setEditing(s);
                setFormError(null);
                setModalOpen(true);
                void handleBatchChange(s.batch_id);
              }}
              onDelete={(s) => void handleDelete(s)}
            />
          )}
        </TabsContent>

        <TabsContent value="today" className="mt-4">
          <DailyScheduleView schedules={filteredToday} />
        </TabsContent>

        {canManageSchedule && (
          <TabsContent value="setup" className="mt-4 grid gap-6 lg:grid-cols-2">
            <SetupPanel title="Subjects">
              <div className="flex gap-2">
                <input
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="New subject name"
                  className={INPUT_CLASS}
                />
                <button
                  type="button"
                  onClick={() => void handleAddSubject()}
                  className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                >
                  Add
                </button>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {subjects.map((s) => (
                  <li key={s.id} className="rounded-lg bg-muted/30 px-3 py-2">
                    {s.name}
                  </li>
                ))}
              </ul>
            </SetupPanel>
            <SetupPanel title="Rooms">
              <div className="flex gap-2">
                <input
                  value={newRoom}
                  onChange={(e) => setNewRoom(e.target.value)}
                  placeholder="Room name"
                  className={INPUT_CLASS}
                />
                <button
                  type="button"
                  onClick={() => void handleAddRoom()}
                  className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                >
                  Add
                </button>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {rooms.map((r) => (
                  <li key={r.id} className="rounded-lg bg-muted/30 px-3 py-2">
                    {r.room_name}
                    {r.building && <span className="text-muted-foreground"> · {r.building}</span>}
                  </li>
                ))}
              </ul>
            </SetupPanel>
          </TabsContent>
        )}

        {canManageSchedule && (
          <TabsContent value="exceptions" className="mt-4">
            <div className="rounded-2xl border border-border bg-card p-5 max-w-xl">
              <h3 className="mb-4 text-sm font-bold uppercase tracking-wider">
                Add holiday / block
              </h3>
              <div className="space-y-3">
                <input
                  type="date"
                  value={newExceptionDate}
                  onChange={(e) => setNewExceptionDate(e.target.value)}
                  className={INPUT_CLASS}
                />
                <input
                  value={newExceptionTitle}
                  onChange={(e) => setNewExceptionTitle(e.target.value)}
                  placeholder="Title (e.g. Republic Day)"
                  className={INPUT_CLASS}
                />
                <button
                  type="button"
                  onClick={() => void handleAddException()}
                  className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
                >
                  Add exception
                </button>
              </div>
            </div>
            <ul className="mt-6 space-y-2">
              {exceptions.map((ex) => (
                <li
                  key={ex.id}
                  className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm"
                >
                  <div>
                    <span className="font-medium">{ex.title}</span>
                    <span className="text-muted-foreground ml-2">{ex.exception_date}</span>
                    <span className="ml-2 capitalize text-xs text-muted-foreground">{ex.type}</span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await deleteScheduleException(ex.id);
                      if (r.success) {
                        toast.success("Removed");
                        void loadSchedules();
                      }
                    }}
                    className="text-xs text-destructive hover:underline"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </TabsContent>
        )}
      </Tabs>

      {canManageSchedule && (
        <ScheduleSlotFormModal
          open={modalOpen}
          editing={editing}
          batches={batches}
          subjects={subjects}
          rooms={rooms}
          staff={staff}
          sections={sections}
          isSubmitting={isSubmitting}
          serverError={formError}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSubmit={handleSlotSubmit}
          onBatchChange={(id) => void handleBatchChange(id)}
        />
      )}
    </ProtectedRoute>
  );
}

function SetupPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-sm font-bold uppercase tracking-wider mb-4">{title}</h3>
      {children}
    </div>
  );
}
