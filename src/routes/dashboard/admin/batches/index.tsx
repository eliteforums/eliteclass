import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, Plus, RotateCcw, Trash2 } from "lucide-react";

import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { useAuthStore } from "@/store/authStore";
import {
  archiveBatch,
  assignStudentsToBatch,
  createBatch,
  getBatchesByInstitute,
  restoreBatch,
  softDeleteBatch,
  updateBatch,
} from "@/services/batch.service";
import type { Batch, BatchStatus, CreateBatchPayload } from "@/types";
import { BatchDetailDrawer } from "@/modules/batches/components/BatchDetailDrawer";
import { AssignStudentsModal } from "@/modules/batches/components/AssignStudentsModal";
import { BatchFormModal } from "@/modules/batches/components/BatchFormModal";
import { formatDate } from "@/utils/helpers";

export const Route = createFileRoute("/dashboard/admin/batches/")({
  head: () => ({ meta: [{ title: "Batches - EduOS" }] }),
  component: BatchesPage,
});

function statusTone(status: BatchStatus): string {
  if (status === "active")
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400";
  if (status === "archived")
    return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400";
  return "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

function BatchesPage() {
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? "";

  const [items, setItems] = useState<Batch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<BatchStatus | "all">("all");

  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);

  const [detailBatch, setDetailBatch] = useState<Batch | null>(null);
  const [assignBatch, setAssignBatch] = useState<Batch | null>(null);

  const fetchBatches = useCallback(async () => {
    if (!instituteId) return;

    setIsLoading(true);
    setError(null);

    const result = await getBatchesByInstitute(instituteId, {
      page,
      pageSize: 10,
      search,
      status,
    });

    if (result.success && result.data) {
      setItems(result.data.items);
      setTotalPages(result.data.meta.totalPages);
      setTotal(result.data.meta.total);
    } else {
      setItems([]);
      setTotalPages(1);
      setTotal(0);
      setError(result.error ?? "Failed to load batches");
    }

    setIsLoading(false);
  }, [instituteId, page, search, status]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  async function handleCreateOrUpdate(
    payload: CreateBatchPayload | Partial<CreateBatchPayload>,
  ): Promise<{ success: boolean; error: string | null }> {
    if (!instituteId) {
      return { success: false, error: "Institute is not available" };
    }

    if (formMode === "create") {
      const createPayload = {
        institute_id: instituteId,
        ...(payload as Omit<CreateBatchPayload, "institute_id">),
      } as CreateBatchPayload;

      const result = await createBatch(createPayload);
      if (!result.success) return { success: false, error: result.error };

      await fetchBatches();
      return { success: true, error: null };
    }

    if (!editingBatch) {
      return { success: false, error: "No batch selected for edit" };
    }

    const updateResult = await updateBatch(editingBatch.id, payload);
    if (!updateResult.success) return { success: false, error: updateResult.error };

    await fetchBatches();
    return { success: true, error: null };
  }

  async function handleArchive(batch: Batch) {
    const result = await archiveBatch(batch.id);
    if (!result.success) {
      setError(result.error ?? "Failed to archive batch");
      return;
    }
    fetchBatches();
  }

  async function handleSoftDelete(batch: Batch) {
    const result = await softDeleteBatch(batch.id);
    if (!result.success) {
      setError(result.error ?? "Failed to set inactive status");
      return;
    }
    fetchBatches();
  }

  async function handleRestore(batch: Batch) {
    const result = await restoreBatch(batch.id);
    if (!result.success) {
      setError(result.error ?? "Failed to restore batch");
      return;
    }
    fetchBatches();
  }

  const columns: DataTableColumn<Batch>[] = [
    {
      key: "batch",
      header: "Batch",
      render: (batch) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{batch.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {batch.batch_code} • {batch.course_name}
          </p>
        </div>
      ),
    },
    {
      key: "timeline",
      header: "Schedule",
      render: (batch) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(batch.start_date)} - {formatDate(batch.end_date)}
        </span>
      ),
    },
    {
      key: "capacity",
      header: "Capacity",
      render: (batch) => (
        <span className="text-sm text-muted-foreground">
          {batch.student_count ?? 0}/{batch.capacity}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (batch) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusTone(batch.status)}`}
        >
          {batch.status}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      headerClassName: "w-px",
      cellClassName: "text-right",
      render: (batch) => (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDetailBatch(batch);
            }}
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFormMode("edit");
              setEditingBatch(batch);
              setIsFormOpen(true);
            }}
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            Edit
          </button>

          {batch.status === "active" ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleArchive(batch);
              }}
              className="rounded-md border border-border px-2 py-1 text-xs text-amber-700 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-950"
            >
              Archive
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleRestore(batch);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-950"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restore
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleSoftDelete(batch);
            }}
            className="rounded-md border border-border px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <ProtectedRoute allowedRoles={["admin"]}>
      <PageHeader
        title="Batch Management"
        subtitle="Create batches, assign students, and power attendance by batch."
        badge={`${total} batches`}
        actions={
          <button
            type="button"
            onClick={() => {
              setFormMode("create");
              setEditingBatch(null);
              setIsFormOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Create Batch
          </button>
        }
      />

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Search by batch name, code, or course..."
          className="w-full sm:max-w-sm"
        />

        <select
          value={status}
          onChange={(e) => {
            setStatus((e.target.value as BatchStatus | "all") ?? "all");
            setPage(1);
          }}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          data={items}
          isLoading={isLoading}
          keyExtractor={(batch) => batch.id}
          onRowClick={(batch) => setDetailBatch(batch)}
          emptyState={
            <EmptyState
              title="No batches found"
              description="Create a batch first to start attendance and grouping students."
              action={
                <button
                  type="button"
                  onClick={() => {
                    setFormMode("create");
                    setEditingBatch(null);
                    setIsFormOpen(true);
                  }}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Create Batch
                </button>
              }
            />
          }
        />
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </button>

          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>

          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || isLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      <BatchFormModal
        isOpen={isFormOpen}
        mode={formMode}
        batch={editingBatch}
        instituteId={instituteId}
        onClose={() => {
          setIsFormOpen(false);
          setEditingBatch(null);
        }}
        onSubmitBatch={handleCreateOrUpdate}
      />

      <BatchDetailDrawer
        batch={detailBatch}
        isOpen={detailBatch !== null}
        instituteId={instituteId}
        onClose={() => setDetailBatch(null)}
        onAssignStudents={() => {
          if (detailBatch) setAssignBatch(detailBatch);
        }}
        onRefreshRequested={fetchBatches}
      />

      <AssignStudentsModal
        isOpen={assignBatch !== null}
        batch={assignBatch}
        instituteId={instituteId}
        onClose={() => setAssignBatch(null)}
        onAssign={async (studentIds) => {
          if (!assignBatch) {
            return { success: false, error: "No batch selected" };
          }

          const result = await assignStudentsToBatch(instituteId, assignBatch.id, studentIds);
          if (!result.success) {
            return { success: false, error: result.error ?? "Failed to assign students" };
          }

          await fetchBatches();
          return { success: true, error: null };
        }}
      />
    </ProtectedRoute>
  );
}
