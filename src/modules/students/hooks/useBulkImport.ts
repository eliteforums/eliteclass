import { useCallback, useMemo, useState } from "react";
import type { BulkImportRow, BulkImportErrorRow, AdmitStudentPayload } from "@/types";
import { admitStudent } from "@/services/student.service";
import { getBatchesByInstitute } from "@/services/batch.service";

function isValidEmail(email?: string | null) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone?: string | null) {
  if (phone === undefined || phone === null) return false;
  const s = String(phone);
  return /[0-9]{6,15}/.test(s.replace(/[^0-9]/g, ""));
}

export default function useBulkImport() {
  const [rows, setRows] = useState<BulkImportRow[]>([]);
  const [errors, setErrors] = useState<BulkImportErrorRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const loadRows = useCallback((r: BulkImportRow[]) => {
    setRows(r.map((row, i) => ({ ...row, rowNumber: i + 1 })));
  }, []);

  const removeRow = useCallback((rowNumber: number) => {
    setRows((prev) => prev.filter((r) => r.rowNumber !== rowNumber));
  }, []);

  const updateRow = useCallback((rowNumber: number, patch: Partial<BulkImportRow>) => {
    setRows((prev) => prev.map((r) => (r.rowNumber === rowNumber ? { ...r, ...patch } : r)));
  }, []);

  const validateRows = useCallback((inputRows: BulkImportRow[]) => {
    const valid: BulkImportRow[] = [];
    const invalid: BulkImportErrorRow[] = [];
    const admissionSet = new Set<string>();
    for (const r of inputRows) {
      const issues: string[] = [];
      if (!r.full_name) issues.push("Missing full_name");
      if (!r.contact_email) issues.push("Missing contact_email");
      if (r.contact_email && !isValidEmail(r.contact_email)) issues.push("Invalid contact_email");
      if (!r.admission_number) issues.push("Missing admission_number");
      if (!r.phone) issues.push("Missing phone");
      if (r.phone && !isValidPhone(r.phone)) issues.push("Invalid phone");
      if (admissionSet.has(r.admission_number)) issues.push("Duplicate admission_number in file");
      admissionSet.add(r.admission_number);
      if (issues.length > 0) invalid.push({ rowNumber: r.rowNumber, studentName: r.full_name, admissionNumber: r.admission_number, errorMessage: issues.join("; ") });
      else valid.push(r);
    }
    return { valid, invalid };
  }, []);

  async function importRows(instituteId: string, instituteName: string | undefined, inputRows?: BulkImportRow[]) {
    const toImport = inputRows ?? rows;
    setIsImporting(true);
    setErrors([]);
    setProgress({ done: 0, total: toImport.length });

    // Resolve batches
    const batchRes = await getBatchesByInstitute(instituteId, { page: 1, pageSize: 2000 });
    const nameToId = new Map<string, string>();
    if (batchRes.success && batchRes.data) {
      for (const b of batchRes.data.items) nameToId.set(b.name.toLowerCase(), b.id);
    }

    const chunkSize = 12;
    const allErrors: BulkImportErrorRow[] = [];
    for (let i = 0; i < toImport.length; i += chunkSize) {
      const chunk = toImport.slice(i, i + chunkSize);
      const promises = chunk.map((r) => {
        const payload: AdmitStudentPayload = {
          institute_id: instituteId,
          institute_name: instituteName,
          student_name: r.full_name,
          student_email: r.contact_email ?? null,
          phone: r.phone ?? "",
          admission_number: r.admission_number,
          batch_id: r.batch ? nameToId.get(r.batch.toLowerCase()) ?? null : null,
          aadhaar_last4: null,
          emergency_contact: r.emergency_contact_name ? { name: r.emergency_contact_name, phone: r.emergency_contact_phone ?? "", relation: r.emergency_relationship ?? "" } : null,
          parent_name: r.parent_name ?? null,
          parent_email: r.parent_email ?? null,
          parent_phone: r.parent_phone ?? null,
          parent_occupation: r.occupation ?? null,
          parent_relation_type: (r.relationship_type as any) ?? null,
        };
        return admitStudent(payload);
      });

      const settled = await Promise.all(promises);
      for (let j = 0; j < settled.length; j++) {
        const res = settled[j];
        const row = chunk[j];
        if (!res.success || !res.data) {
          allErrors.push({ rowNumber: row.rowNumber, studentName: row.full_name, admissionNumber: row.admission_number, errorMessage: res.error ?? "Unknown error" });
        }
        setProgress((p) => ({ done: p.done + 1, total: p.total }));
      }
    }

    setErrors(allErrors);
    setIsImporting(false);
    return { errors: allErrors };
  }

  function downloadErrorCSV(fileType = "unknown") {
    if (errors.length === 0) return;
    const header = "row_number,file_type,student_name,admission_number,error_message";
    const rowsCsv = errors.map((e) => `${e.rowNumber},${fileType},"${(e.studentName ?? "").replace(/"/g, '""')}","${(e.admissionNumber ?? "").replace(/"/g, '""')}","${e.errorMessage.replace(/"/g, '""')}"`);
    const csv = [header, ...rowsCsv].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "import_errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return useMemo(() => ({
    rows,
    loadRows,
    removeRow,
    updateRow,
    validateRows,
    importRows,
    isImporting,
    progress,
    errors,
    downloadErrorCSV,
  }), [rows, loadRows, removeRow, updateRow, validateRows, importRows, isImporting, progress, errors, downloadErrorCSV]);
}

