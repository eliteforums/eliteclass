import { useCallback } from "react";
import type { BulkImportRow } from "@/types";

export function useExcelParser() {
  const parse = useCallback(async (file: File): Promise<{ rows: BulkImportRow[]; error?: string }> => {
    if (!file) return { rows: [], error: "No file provided." };
    if (file.size > 10 * 1024 * 1024) return { rows: [], error: "File exceeds 10MB limit." };

    try {
      const arrayBuffer = await file.arrayBuffer();
      const { Workbook } = await import("exceljs");
      const workbook = new Workbook();
      await workbook.xlsx.load(arrayBuffer);

      const worksheet = workbook.worksheets[0];
      if (!worksheet) return { rows: [], error: "Excel file does not contain a worksheet." };

      const headerRow = worksheet.getRow(1);
      const headers = headerRow.values
        .slice(1)
        .map((value) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_"));

      const rows: BulkImportRow[] = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        const record: Record<string, any> = {};
        row.eachCell((cell, colNumber) => {
          const key = headers[colNumber - 1];
          if (key) record[key] = cell.value ?? "";
        });

        rows.push({
          rowNumber,
          full_name: (record["full_name"] ?? record["full name"] ?? "").toString().trim(),
          contact_email: (record["contact_email"] ?? record["contact email"] ?? "") || null,
          phone: (record["phone"] ?? "") || null,
          admission_number: (record["admission_number"] ?? record["admission number"] ?? "").toString().trim(),
          batch: (record["batch"] ?? "") || null,
          emergency_contact_name: (record["emergency_contact_name"] ?? record["emergency contact name"] ?? "") || null,
          emergency_contact_phone: (record["emergency_contact_phone"] ?? record["emergency contact phone"] ?? "") || null,
          emergency_relationship: (record["emergency_relationship"] ?? record["emergency relationship"] ?? "") || null,
          parent_name: (record["parent_name"] ?? record["parent name"] ?? "") || null,
          parent_email: (record["parent_email"] ?? record["parent email"] ?? "") || null,
          parent_phone: (record["parent_phone"] ?? record["parent phone"] ?? "") || null,
          occupation: (record["occupation"] ?? "") || null,
          relationship_type: (record["relationship_type"] ?? record["relationship type"] ?? null) as any,
        });
      });

      return { rows };
    } catch (err: any) {
      return { rows: [], error: "Excel parser failed (exceljs library missing or parse error)." };
    }
  }, []);

  return { parse };
}
