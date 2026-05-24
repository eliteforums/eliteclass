import { useCallback } from "react";
import type { BulkImportRow } from "@/types";

export function useCSVParser() {
  const parse = useCallback(async (file: File): Promise<{ rows: BulkImportRow[]; error?: string }> => {
    if (!file) return { rows: [], error: "No file provided." };
    if (file.size > 10 * 1024 * 1024) return { rows: [], error: "File exceeds 10MB limit." };

    try {
      const Papa = (await import("papaparse")).default;
      const text = await file.text();
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
      if (parsed.errors && parsed.errors.length > 0) {
        return { rows: [], error: `CSV parse error: ${parsed.errors[0].message}` };
      }

      const data = parsed.data as Record<string, any>[];
      const rows: BulkImportRow[] = data.map((r, i) => ({
        rowNumber: i + 1,
        full_name: (r["full_name"] ?? r["full name"] ?? "").toString().trim(),
        contact_email: (r["contact_email"] ?? r["contact email"] ?? "") || null,
        phone: (r["phone"] ?? "") || null,
        admission_number: (r["admission_number"] ?? r["admission number"] ?? "").toString().trim(),
        batch: (r["batch"] ?? "") || null,
        emergency_contact_name: (r["emergency_contact_name"] ?? r["emergency contact name"] ?? "") || null,
        emergency_contact_phone: (r["emergency_contact_phone"] ?? r["emergency contact phone"] ?? "") || null,
        emergency_relationship: (r["emergency_relationship"] ?? r["emergency relationship"] ?? "") || null,
        parent_name: (r["parent_name"] ?? r["parent name"] ?? "") || null,
        parent_email: (r["parent_email"] ?? r["parent email"] ?? "") || null,
        parent_phone: (r["parent_phone"] ?? r["parent phone"] ?? "") || null,
        occupation: (r["occupation"] ?? "") || null,
        relationship_type: (r["relationship_type"] ?? r["relationship type"] ?? null) as any,
      }));

      return { rows };
    } catch (err: any) {
      return { rows: [], error: "CSV parser library (papaparse) not available or failed to parse." };
    }
  }, []);

  return { parse };
}
