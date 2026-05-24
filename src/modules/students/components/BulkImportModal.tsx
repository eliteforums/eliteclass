import React, { useState, useRef } from "react";
import { X, UploadCloud } from "lucide-react";
import ImportPreviewTable from "./ImportPreviewTable";
import ImportProgress from "./ImportProgress";
import FileDropZone from "./FileDropZone";
import TemplateDownloader from "./TemplateDownloader";
import { useCSVParser } from "@/modules/students/hooks/useCSVParser";
import { useExcelParser } from "@/modules/students/hooks/useExcelParser";
import { useXMLParser } from "@/modules/students/hooks/useXMLParser";
import useBulkImport from "@/modules/students/hooks/useBulkImport";
import { isSupabaseAdminConfigured } from "@/lib/supabase";
import type { BulkImportRow } from "@/types";

interface Props {
  instituteId: string;
  instituteName?: string;
  onClose: () => void;
  onComplete?: () => void;
}

export function BulkImportModal({ instituteId, instituteName, onClose, onComplete }: Props) {
  const [mode, setMode] = useState<"manual" | "import">("import");
  const [fileName, setFileName] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [validation, setValidation] = useState<Record<number, string | null>>({});
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { parse: parseCSV } = useCSVParser();
  const { parse: parseXLSX } = useExcelParser();
  const { parse: parseXML } = useXMLParser();
  const {
    rows: importedRows,
    loadRows,
    validateRows,
    importRows,
    isImporting,
    progress,
    errors,
  } = useBulkImport();

  async function handleFile(file?: File) {
    if (!file) return;
    setFileName(file.name);
    setStatusMessage(null);
    setValidation({});
    let res: { rows: BulkImportRow[]; error?: string } = { rows: [] };
    const name = file.name.toLowerCase();
    if (name.endsWith(".csv")) {
      res = await parseCSV(file);
    } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      res = await parseXLSX(file);
    } else if (name.endsWith(".xml")) {
      res = await parseXML(file);
    } else {
      setValidation({ 0: "Unsupported file type" });
      return;
    }

    if (res.error) {
      setValidation({ 0: res.error });
      setStatusMessage(res.error);
      loadRows([]);
      return;
    }

    loadRows(res.rows);
    const { valid, invalid } = validateRows(res.rows);
    const map: Record<number, string | null> = {};
    for (const v of invalid) map[v.rowNumber] = v.errorMessage;
    setValidation(map);
    setStatusMessage(
      res.rows.length > 0
        ? `Loaded ${res.rows.length} row${res.rows.length === 1 ? "" : "s"} from ${file.name}.`
        : "No rows found in the selected file.",
    );
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  }

  async function handleImport() {
    if (importedRows.length === 0) return;
    const { valid } = validateRows(importedRows);
    const result = await importRows(instituteId, instituteName, valid);
    setStatusMessage(
      result.errors.length > 0
        ? `Import finished with ${result.errors.length} error${result.errors.length === 1 ? "" : "s"}.`
        : "Import completed successfully.",
    );
    if (onComplete) onComplete();
  }

  function downloadErrorReport() {
    if (!errors || errors.length === 0) return;
    const csv = [
      "row_number,student_name,admission_number,error_message",
      ...errors.map(
        (e) =>
          `${e.rowNumber},"${e.studentName ?? ""}","${e.admissionNumber ?? ""}","${e.errorMessage.replace(/"/g, '""')}"`,
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "import_errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="relative bg-card rounded-2xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Bulk Student Import</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={`rounded-lg px-3 py-2 ${mode === "manual" ? "bg-primary text-primary-foreground" : "border border-border"}`}
          >
            Manual Entry
          </button>
          <button
            type="button"
            onClick={() => setMode("import")}
            className={`rounded-lg px-3 py-2 ${mode === "import" ? "bg-primary text-primary-foreground" : "border border-border"}`}
          >
            Import XML File
          </button>
        </div>
      </div>

      {mode === "manual" ? (
        <div>
          <p className="text-sm text-muted-foreground">Use the existing manual admission form.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {!isSupabaseAdminConfigured && (
            <div className="rounded-md border border-yellow-600 bg-yellow-50 p-3 text-sm text-yellow-800">
              <div className="font-medium">Import disabled — service role key missing</div>
              <div className="mt-1">To perform imports the local dev environment must provide a Supabase service_role key. Create a .env with VITE_SUPABASE_SERVICE_ROLE_KEY (local dev only) and restart the dev server.</div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <TemplateDownloader />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
            >
              <UploadCloud className="h-4 w-4" />
              <span>Upload File</span>
              <input
                ref={inputRef}
                type="file"
                accept=".xml,.xlsx,.xls,.csv,application/xml,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
            </button>
            {fileName && <div className="text-sm text-muted-foreground">{fileName}</div>}
          </div>

          <div>
            <FileDropZone onFile={(f) => void handleFile(f)} />
          </div>

          <div>
            <h3 className="text-sm font-medium mb-2">Preview</h3>
            <ImportPreviewTable rows={importedRows} validation={validation} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="col-span-2">
              <h4 className="text-sm font-medium">Validation Summary</h4>
              <p className="text-sm text-muted-foreground">Total Rows: {importedRows.length}</p>
              <p className="text-sm text-muted-foreground">
                Failed Rows: {Object.keys(validation).length}
              </p>
            </div>
            <div>
              <button
                type="button"
                disabled={isImporting || !isSupabaseAdminConfigured}
                onClick={handleImport}
                className="w-full rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"
              >
                Start Import
              </button>
              <p className="mt-2 text-xs text-muted-foreground">
                {importedRows.length === 0
                  ? "Upload a valid file to enable import results."
                  : `Ready to import ${importedRows.length} row${importedRows.length === 1 ? "" : "s"}.`}
              </p>
              <button
                type="button"
                disabled={errors.length === 0}
                onClick={downloadErrorReport}
                className="mt-2 w-full rounded-lg border border-border px-4 py-2 text-sm"
              >
                Download Error Report
              </button>
            </div>
          </div>

          {isImporting && (
            <div className="mt-4">
              <ImportProgress done={progress.done} total={progress.total} />
            </div>
          )}

          {errors && errors.length > 0 && (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <div className="font-semibold">Import completed with errors</div>
              <ul className="list-disc pl-5 text-xs mt-2">
                {errors.slice(0, 5).map((e, i) => (
                  <li key={i}>{`Row ${e.rowNumber}: ${e.errorMessage}`}</li>
                ))}
              </ul>
            </div>
          )}

          {statusMessage && (
            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              {statusMessage}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default BulkImportModal;
