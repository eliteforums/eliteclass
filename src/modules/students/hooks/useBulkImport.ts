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

// ── Rate limit safe delay ────────────────────────────────────────────────────
// Supabase free tier has strict rate limits on auth.admin.createUser().
// Each admitStudent call creates 1-2 auth users (student + optional parent).
// We process ONE student at a time with 3s gap to stay well under limits.
const CHUNK_SIZE = 1;
const DELAY_BETWEEN_CHUNKS_MS = 3000;
const RETRY_DELAY_MS = 10000;
const MAX_RETRIES = 5;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Attempt to admit a student with exponential backoff retries.
 * Returns the result after all retries are exhausted.
 */
async function admitWithRetry(
  payload: AdmitStudentPayload,
  maxRetries: number = MAX_RETRIES,
): Promise<ReturnType<typeof admitStudent>> {
  let lastResult: Awaited<ReturnType<typeof admitStudent>> | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await admitStudent(payload);

    if (result.success) return result;

    lastResult = result;

    // Check if it's a rate limit error — retry with increasing delay
    const isRateLimit =
      result.error &&
      (result.error.toLowerCase().includes("rate") ||
        result.error.includes("429") ||
        result.error.toLowerCase().includes("too many") ||
        result.error.toLowerCase().includes("request limit") ||
        result.error.toLowerCase().includes("exceeded"));

    if (isRateLimit && attempt < maxRetries) {
      // Exponential backoff: 5s, 10s, 20s
      const backoff = RETRY_DELAY_MS * Math.pow(2, attempt);
      await sleep(backoff);
      continue;
    }

    // Not a rate limit error or retries exhausted — return the error
    break;
  }

  return lastResult!;
}

export default function useBulkImport() {
  const [rows, setRows] = useState<BulkImportRow[]>([]);
  const [errors, setErrors] = useState<BulkImportErrorRow[]>([]);
  const [failedRows, setFailedRows] = useState<BulkImportRow[]>([]);
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
    setFailedRows([]);
    setProgress({ done: 0, total: toImport.length });

    // Resolve batches
    const batchRes = await getBatchesByInstitute(instituteId, { page: 1, pageSize: 2000 });
    const nameToId = new Map<string, string>();
    if (batchRes.success && batchRes.data) {
      for (const b of batchRes.data.items) nameToId.set(b.name.toLowerCase(), b.id);
    }

    const allErrors: BulkImportErrorRow[] = [];
    const allFailedRows: BulkImportRow[] = [];

    // Process in small chunks with generous delays
    for (let i = 0; i < toImport.length; i += CHUNK_SIZE) {
      const chunk = toImport.slice(i, i + CHUNK_SIZE);

      // Process each student in the chunk sequentially (safest for rate limits)
      for (const row of chunk) {
        const payload: AdmitStudentPayload = {
          institute_id: instituteId,
          institute_name: instituteName,
          student_name: row.full_name,
          student_email: row.contact_email ?? null,
          phone: row.phone ?? "",
          admission_number: row.admission_number,
          batch_id: row.batch ? nameToId.get(row.batch.toLowerCase()) ?? null : null,
          aadhaar_last4: null,
          emergency_contact: row.emergency_contact_name
            ? { name: row.emergency_contact_name, phone: row.emergency_contact_phone ?? "", relation: row.emergency_relationship ?? "" }
            : null,
          parent_name: row.parent_name ?? null,
          parent_email: row.parent_email ?? null,
          parent_phone: row.parent_phone ?? null,
          parent_occupation: row.occupation ?? null,
          parent_relation_type: (row.relationship_type as any) ?? null,
        };

        const result = await admitWithRetry(payload);

        if (!result.success || !result.data) {
          allErrors.push({
            rowNumber: row.rowNumber,
            studentName: row.full_name,
            admissionNumber: row.admission_number,
            errorMessage: result.error ?? "Unknown error",
          });
          allFailedRows.push(row);
        }

        setProgress((p) => ({ done: p.done + 1, total: p.total }));

        // Small delay between individual requests within a chunk
        await sleep(500);
      }

      // Longer delay between chunks to stay well under rate limits
      if (i + CHUNK_SIZE < toImport.length) {
        await sleep(DELAY_BETWEEN_CHUNKS_MS);
      }
    }

    setErrors(allErrors);
    setFailedRows(allFailedRows);
    setIsImporting(false);
    return { errors: allErrors };
  }

  /**
   * Downloads a CSV file containing all failed student rows with their original data
   * so the user can fix issues and re-upload only the failed ones.
   */
  function downloadFailedCSV() {
    if (failedRows.length === 0 && errors.length === 0) return;

    // If we have the original row data, export it in the same format as the input
    if (failedRows.length > 0) {
      const header = "full_name,admission_number,contact_email,phone,batch,parent_name,parent_email,parent_phone,relationship_type,occupation,emergency_contact_name,emergency_contact_phone,emergency_relationship,error_message";
      const csvRows = failedRows.map((row, idx) => {
        const error = errors[idx]?.errorMessage ?? "";
        return [
          `"${(row.full_name ?? "").replace(/"/g, '""')}"`,
          `"${(row.admission_number ?? "").replace(/"/g, '""')}"`,
          `"${(row.contact_email ?? "").replace(/"/g, '""')}"`,
          `"${(row.phone ?? "").replace(/"/g, '""')}"`,
          `"${(row.batch ?? "").replace(/"/g, '""')}"`,
          `"${(row.parent_name ?? "").replace(/"/g, '""')}"`,
          `"${(row.parent_email ?? "").replace(/"/g, '""')}"`,
          `"${(row.parent_phone ?? "").replace(/"/g, '""')}"`,
          `"${(row.relationship_type ?? "").replace(/"/g, '""')}"`,
          `"${(row.occupation ?? "").replace(/"/g, '""')}"`,
          `"${(row.emergency_contact_name ?? "").replace(/"/g, '""')}"`,
          `"${(row.emergency_contact_phone ?? "").replace(/"/g, '""')}"`,
          `"${(row.emergency_relationship ?? "").replace(/"/g, '""')}"`,
          `"${error.replace(/"/g, '""')}"`,
        ].join(",");
      });
      const csv = [header, ...csvRows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `failed_students_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    // Fallback: export just the error info if we don't have original rows
    const header = "row_number,student_name,admission_number,error_message";
    const csvRows = errors.map((e) =>
      `${e.rowNumber},"${(e.studentName ?? "").replace(/"/g, '""')}","${(e.admissionNumber ?? "").replace(/"/g, '""')}","${e.errorMessage.replace(/"/g, '""')}"`
    );
    const csv = [header, ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `failed_students_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Keep backward-compatible downloadErrorCSV as alias
  function downloadErrorCSV(fileType = "unknown") {
    downloadFailedCSV();
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
    failedRows,
    downloadErrorCSV,
    downloadFailedCSV,
  }), [rows, loadRows, removeRow, updateRow, validateRows, importRows, isImporting, progress, errors, failedRows, downloadErrorCSV, downloadFailedCSV]);
}
