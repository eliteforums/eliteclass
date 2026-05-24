import { useCallback } from "react";
import type { BulkImportRow } from "@/types";

// XML parser using fast-xml-parser dynamically with XXE protections.
export function useXMLParser() {
  const parse = useCallback(async (file: File): Promise<{ rows: BulkImportRow[]; error?: string }> => {
    if (!file) return { rows: [], error: "No file provided." };
    if (file.size > 10 * 1024 * 1024) return { rows: [], error: "File exceeds 10MB limit." };

    const text = await file.text();
    // Reject DOCTYPE / ENTITY to avoid XXE
    if (/<!DOCTYPE\s+/i.test(text) || /<!ENTITY\s+/i.test(text)) {
      return { rows: [], error: "XML contains forbidden DOCTYPE/ENTITY declarations." };
    }

    try {
      const fxp = await import("fast-xml-parser");
      const options = { ignoreAttributes: true, attributeNamePrefix: "@_" };
      const parsed = fxp.parse(text, options) as any;

      const studentsNode = parsed?.students?.student ?? parsed?.student ?? [];
      const list = Array.isArray(studentsNode) ? studentsNode : [studentsNode];

      const rows: BulkImportRow[] = list.map((r: any, i: number) => ({
        rowNumber: i + 1,
        full_name: (r.full_name ?? "").toString().trim(),
        contact_email: (r.contact_email ?? null) || null,
        phone: (r.phone ?? null) || null,
        admission_number: (r.admission_number ?? "").toString().trim(),
        batch: (r.batch ?? null) || null,
        emergency_contact_name: (r.emergency_contact_name ?? null) || null,
        emergency_contact_phone: (r.emergency_contact_phone ?? null) || null,
        emergency_relationship: (r.emergency_relationship ?? null) || null,
        parent_name: (r.parent_name ?? null) || null,
        parent_email: (r.parent_email ?? null) || null,
        parent_phone: (r.parent_phone ?? null) || null,
        occupation: (r.occupation ?? null) || null,
        relationship_type: (r.relationship_type ?? null) as any,
      }));

      return { rows };
    } catch (err: any) {
      // Fallback: try DOMParser
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, "application/xml");
        const parsererror = doc.getElementsByTagName("parsererror");
        if (parsererror.length > 0) return { rows: [], error: "Invalid XML format." };

        const students = Array.from(doc.getElementsByTagName("student"));
        const rows: BulkImportRow[] = students.map((el, i) => {
          const getText = (tag: string) => {
            const node = el.getElementsByTagName(tag)[0];
            return node && node.textContent ? node.textContent.trim() : "";
          };

          return {
            rowNumber: i + 1,
            full_name: getText("full_name"),
            contact_email: getText("contact_email") || null,
            phone: getText("phone") || null,
            admission_number: getText("admission_number"),
            batch: getText("batch") || null,
            emergency_contact_name: getText("emergency_contact_name") || null,
            emergency_contact_phone: getText("emergency_contact_phone") || null,
            emergency_relationship: getText("emergency_relationship") || null,
            parent_name: getText("parent_name") || null,
            parent_email: getText("parent_email") || null,
            parent_phone: getText("parent_phone") || null,
            occupation: getText("occupation") || null,
            relationship_type: (getText("relationship_type") as any) || null,
          } as BulkImportRow;
        });

        return { rows };
      } catch (e) {
        return { rows: [], error: "Failed to parse XML." };
      }
    }
  }, []);

  return { parse };
}

export default useXMLParser;
