import { useMemo } from "react";
import { MoreVertical, Mail, Phone, MapPin, Eye, Trash2, ShieldCheck, UserCog } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { getInitials } from "@/utils/helpers";
import type { Staff } from "@/types";

interface StaffTableProps {
  staff: Staff[];
  isLoading: boolean;
  onView: (staff: Staff) => void;
  onDelete: (staff: Staff) => void;
}

export function StaffTable({ staff, isLoading, onView, onDelete }: StaffTableProps) {
  const columns = useMemo<DataTableColumn<Staff>[]>(() => [
    {
      key: "name",
      header: "Staff Member",
      render: (s) => (
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary uppercase">
            {s.user?.avatar_url ? (
              <img src={s.user.avatar_url} alt={s.user.name} className="h-full w-full rounded-full object-cover" />
            ) : (
              getInitials(s.user?.name ?? "Staff")
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{s.user?.name ?? "Unknown"}</p>
            <p className="truncate text-xs text-muted-foreground">{s.user?.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "designation",
      header: "Role / Designation",
      render: (s) => (
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">{s.designation}</p>
          <p className="text-xs text-muted-foreground">{s.department}</p>
        </div>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      render: (s) => (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Phone className="h-3 w-3" />
            {s.user?.phone ?? "No phone"}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (s) => <StatusBadge status={s.is_active !== false ? "active" : "inactive"} />,
    },
    {
      key: "actions",
      header: "",
      headerClassName: "w-[50px]",
      cellClassName: "text-right",
      render: (s) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onView(s); }}
            className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted"
            title="View Details"
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(s); }}
            className="p-1.5 text-muted-foreground hover:text-destructive transition-colors rounded-md hover:bg-destructive/10"
            title="Remove Staff"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ], [onView, onDelete]);

  return (
    <DataTable
      columns={columns}
      data={staff}
      isLoading={isLoading}
      keyExtractor={(s) => s.id}
      onRowClick={onView}
      emptyState={
        <EmptyState
          icon={<UserCog className="h-10 w-10" />}
          title="No staff members found"
          description="Admit your first staff member to get started."
        />
      }
    />
  );
}
