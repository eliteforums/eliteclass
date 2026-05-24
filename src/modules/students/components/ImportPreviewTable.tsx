import React, { useState } from "react";
import type { BulkImportRow } from "@/types";

interface Props {
  rows: BulkImportRow[];
  validation?: Record<number, string | null>;
  onRemove?: (rowNumber: number) => void;
  onUpdate?: (rowNumber: number, patch: Partial<BulkImportRow>) => void;
}

export function ImportPreviewTable({ rows, validation = {}, onRemove, onUpdate }: Props) {
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Partial<BulkImportRow> | null>(null);

  function startEdit(r: BulkImportRow) {
    setEditing(r.rowNumber);
    setDraft(r);
  }

  function commit() {
    if (editing && draft && onUpdate) onUpdate(editing, draft);
    setEditing(null);
    setDraft(null);
  }

  return (
    <div className="overflow-auto rounded-lg border border-border bg-card p-2">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="p-2 text-left">#</th>
            <th className="p-2 text-left">Full Name</th>
            <th className="p-2 text-left">Admission No</th>
            <th className="p-2 text-left">Phone</th>
            <th className="p-2 text-left">Batch</th>
            <th className="p-2 text-left">Status</th>
            <th className="p-2 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.rowNumber} className="border-t border-border">
              <td className="p-2">{r.rowNumber}</td>
              <td className="p-2">
                {editing === r.rowNumber ? (
                  <input className="w-full rounded border px-2 py-1 text-sm" value={draft?.full_name ?? ""} onChange={(e) => setDraft(d => ({ ...(d||{}), full_name: e.target.value }))} />
                ) : (
                  r.full_name
                )}
              </td>
              <td className="p-2">
                {editing === r.rowNumber ? (
                  <input className="w-full rounded border px-2 py-1 text-sm" value={draft?.admission_number ?? ""} onChange={(e) => setDraft(d => ({ ...(d||{}), admission_number: e.target.value }))} />
                ) : (
                  r.admission_number
                )}
              </td>
              <td className="p-2">
                {editing === r.rowNumber ? (
                  <input className="w-full rounded border px-2 py-1 text-sm" value={draft?.phone ?? ""} onChange={(e) => setDraft(d => ({ ...(d||{}), phone: e.target.value }))} />
                ) : (
                  r.phone ?? "Not Added"
                )}
              </td>
              <td className="p-2">
                {editing === r.rowNumber ? (
                  <input className="w-full rounded border px-2 py-1 text-sm" value={draft?.batch ?? ""} onChange={(e) => setDraft(d => ({ ...(d||{}), batch: e.target.value }))} />
                ) : (
                  r.batch ?? "Unassigned"
                )}
              </td>
              <td className="p-2">
                {validation[r.rowNumber] ? (
                  <span className="text-xs text-destructive">{validation[r.rowNumber]}</span>
                ) : (
                  <span className="text-xs text-foreground">Valid</span>
                )}
              </td>
              <td className="p-2">
                {editing === r.rowNumber ? (
                  <div className="flex gap-2">
                    <button onClick={commit} className="text-sm text-primary">Save</button>
                    <button onClick={() => { setEditing(null); setDraft(null); }} className="text-sm text-muted-foreground">Cancel</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(r)} className="text-sm text-primary">Edit</button>
                    <button onClick={() => onRemove && onRemove(r.rowNumber)} className="text-sm text-destructive">Remove</button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ImportPreviewTable;
