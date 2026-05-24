import { useCallback, useState } from "react";
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

export function useStudentImport() {
  const [isImporting, setIsImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [errors, setErrors] = useState<BulkImportErrorRow[]>([]);

  const validateRows = useCallback((rows: BulkImportRow[]) => {
    const valid: BulkImportRow[] = [];
    const invalid: BulkImportErrorRow[] = [];

    const admissionSet = new Set<string>();

    for (const r of rows) {
      const issues: string[] = [];
      if (!r.full_name) issues.push("Missing full_name");
      if (!r.admission_number) issues.push("Missing admission_number");
      if (!r.contact_email) issues.push("Missing contact_email");
      if (r.contact_email && !isValidEmail(r.contact_email)) issues.push("Invalid contact_email");
      if (!r.phone) issues.push("Missing phone");
      if (r.phone && !isValidPhone(r.phone)) issues.push("Invalid phone");
      if (admissionSet.has(r.admission_number)) issues.push("Duplicate admission_number in file");
      admissionSet.add(r.admission_number);

      if (issues.length > 0) {
        invalid.push({ rowNumber: r.rowNumber, studentName: r.full_name, admissionNumber: r.admission_number, errorMessage: issues.join("; ") });
      } else {
        valid.push(r);
      }
    }

    return { valid, invalid };
  }, []);

  const importRows = useCallback(
    async (rows: BulkImportRow[], instituteId: string, instituteName?: string) => {
      setIsImporting(true);
      setErrors([]);
      setProgress({ done: 0, total: rows.length });

      // Resolve batch names to IDs (best-effort). If not found, leave null.
      const batchRes = await getBatchesByInstitute(instituteId, { page: 1, pageSize: 500 });
      const nameToId = new Map<string, string>();
      if (batchRes.success && batchRes.data) {
        for (const b of batchRes.data.items) {
          nameToId.set(b.name.toLowerCase(), b.id);
        }
      }

      const payloads: AdmitStudentPayload[] = rows.map((r) => ({
        institute_id: instituteId,
        institute_name: instituteName,
        student_name: r.full_name,
        student_email: r.contact_email ?? null,
        phone: r.phone ?? "",
        admission_number: r.admission_number,
        batch_id: r.batch ? nameToId.get(r.batch.toLowerCase()) ?? null : null,
        aadhaar_last4: null,
        emergency_contact: r.emergency_contact_name
          ? { name: r.emergency_contact_name, phone: r.emergency_contact_phone ?? "", relation: r.emergency_relationship ?? "" }
          : null,
        parent_name: r.parent_name ?? null,
        parent_email: r.parent_email ?? null,
        parent_phone: r.parent_phone ?? null,
        parent_occupation: r.occupation ?? null,
        parent_relation_type: (r.relationship_type as any) ?? null,
      }));

      const results: typeof payloads = payloads;

      // Process in chunks to update progress
      const chunkSize = 8;
      const allErrors: BulkImportErrorRow[] = [];

      for (let i = 0; i < results.length; i += chunkSize) {
        const chunk = results.slice(i, i + chunkSize);
        const promises = chunk.map((p) => admitStudent(p));
        const settled = await Promise.all(promises);
        for (let j = 0; j < settled.length; j++) {
          const res = settled[j];
          const payloadIndex = i + j;
          if (!res.success || !res.data) {
            allErrors.push({ rowNumber: payloadIndex + 1, studentName: chunk[j].student_name, admissionNumber: chunk[j].admission_number, errorMessage: res.error ?? "Unknown error" });
          }
          setProgress((p) => ({ done: p.done + 1, total: p.total }));
        }
      }

      setErrors(allErrors);
      setIsImporting(false);
      return { errors: allErrors };
    },
    [],
  );

  return { isImporting, progress, errors, validateRows, importRows };
}

export default useStudentImport;
