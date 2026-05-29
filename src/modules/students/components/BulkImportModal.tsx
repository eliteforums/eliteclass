import React, { useState, useRef } from "react";
import { X, UploadCloud, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import ImportPreviewTable from "./ImportPreviewTable";
import ImportProgress from "./ImportProgress";
import FileDropZone from "./FileDropZone";
import TemplateDownloader from "./TemplateDownloader";
import { useCSVParser } from "@/modules/students/hooks/useCSVParser";
import { useExcelParser } from "@/modules/students/hooks/useExcelParser";
import { useXMLParser } from "@/modules/students/hooks/useXMLParser";
import useBulkImport from "@/modules/students/hooks/useBulkImport";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  validateCSVData,
  bulkCreateStudents,
  type BulkUploadProgress,
  type BulkUploadResult,
} from "@/services/bulk-upload.service";
import type { BulkImportRow } from "@/types";

interface Props {
  instituteId: string;
  instituteName?: string;
  onClose: () => void;
  onComplete?: () => void;
}

/**
 * Detects whether parsed CSV rows came from the simplified 3-column format.
 * Returns true if the CSV had "Full Name", "Mail ID", "Phone No" headers.
 */
function isSimplifiedCSVRows(rows: BulkImportRow[]): boolean {
  if (rows.length === 0) return false;
  // Any CSV without admission_number is treated as simplified format
  return rows.some(
    (r) => !r.admission_number || r.admission_number.trim() === ""
  );
}

export function BulkImportModal({ instituteId, instituteName, onClose, onComplete }: Props) {
  const [mode, setMode] = useState<"manual" | "import">("import");
  const [fileName, setFileName] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [validation, setValidation] = useState<Record<number, string | null>>({});
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Simplified CSV mode state
  const [isSimplifiedMode, setIsSimplifiedMode] = useState(false);
  const [simplifiedValidation, setSimplifiedValidation] = useState<{
    valid: { rowNumber: number; fullName: string; email: string; phone: string }[];
    invalid: { rowNumber: number; error: string }[];
  } | null>(null);
  const [bulkProgress, setBulkProgress] = useState<BulkUploadProgress | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkUploadResult | null>(null);
  const [isBulkImporting, setIsBulkImporting] = useState(false);

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
    downloadFailedCSV,
  } = useBulkImport();

  async function handleFile(file?: File) {
    if (!file) return;
    setFileName(file.name);
    setStatusMessage(null);
    setValidation({});
    setIsSimplifiedMode(false);
    setSimplifiedValidation(null);
    setBulkProgress(null);
    setBulkResult(null);

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

    // ALL CSV files use the simplified bulk upload path
    if (name.endsWith(".csv")) {
      setIsSimplifiedMode(true);
      // Re-parse as raw records for validateCSVData
      const rawRows = res.rows.map((r) => ({
        "Full Name": r.full_name ?? "",
        "Mail ID": r.contact_email ?? "",
        "Phone No": r.phone ?? "",
      }));
      const result = validateCSVData(rawRows);
      setSimplifiedValidation(result);
      loadRows(res.rows);
      setStatusMessage(
        `Loaded ${res.rows.length} row${res.rows.length === 1 ? "" : "s"} (simplified CSV format). ` +
          `${result.valid.length} valid, ${result.invalid.length} with errors.`
      );
      return;
    }

    // Standard format handling
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

  async function handleSimplifiedImport() {
    if (!simplifiedValidation || simplifiedValidation.valid.length === 0) return;
    setIsBulkImporting(true);
    setBulkProgress({
      total: simplifiedValidation.valid.length,
      processed: 0,
      created: 0,
      skipped: 0,
      failed: 0,
    });

    const result = await bulkCreateStudents(
      simplifiedValidation.valid,
      instituteId,
      (progress) => setBulkProgress({ ...progress })
    );

    setBulkResult(result);
    setIsBulkImporting(false);
    setStatusMessage(
      `Import complete: ${result.summary.created} created, ${result.summary.skipped} skipped, ${result.summary.failed} failed.`
    );
    if (onComplete) onComplete();
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
    // Use the hook's downloadFailedCSV which includes all original row data
    // so users can fix and re-upload just the failed students
    downloadFailedCSV();
  }

  // ── Simplified CSV Mode UI ─────────────────────────────────────────────────

  function renderSimplifiedMode() {
    return (
      <div className="space-y-4">
        {/* Validation Errors */}
        {simplifiedValidation && simplifiedValidation.invalid.length > 0 && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive mb-2">
              <AlertTriangle className="h-4 w-4" />
              <span>
                {simplifiedValidation.invalid.length} row{simplifiedValidation.invalid.length === 1 ? "" : "s"} with validation errors
              </span>
            </div>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {simplifiedValidation.invalid.map((err) => (
                <div key={err.rowNumber} className="text-xs text-destructive/80">
                  Row {err.rowNumber}: {err.error}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Valid rows summary */}
        {simplifiedValidation && simplifiedValidation.valid.length > 0 && !bulkResult && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              <span>
                {simplifiedValidation.valid.length} valid row{simplifiedValidation.valid.length === 1 ? "" : "s"} ready to import
              </span>
            </div>
          </div>
        )}

        {/* Progress indicator during import */}
        {isBulkImporting && bulkProgress && (
          <div className="space-y-3">
            <ImportProgress done={bulkProgress.processed} total={bulkProgress.total} />
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="text-green-600">Created: {bulkProgress.created}</span>
              <span className="text-yellow-600">Skipped: {bulkProgress.skipped}</span>
              <span className="text-red-600">Failed: {bulkProgress.failed}</span>
            </div>
          </div>
        )}

        {/* Results summary after completion */}
        {bulkResult && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <h4 className="text-sm font-medium mb-3">Import Results</h4>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-2 rounded-md bg-green-50 border border-green-200">
                  <div className="text-lg font-semibold text-green-700">{bulkResult.summary.created}</div>
                  <div className="text-xs text-green-600">Created</div>
                </div>
                <div className="text-center p-2 rounded-md bg-yellow-50 border border-yellow-200">
                  <div className="text-lg font-semibold text-yellow-700">{bulkResult.summary.skipped}</div>
                  <div className="text-xs text-yellow-600">Skipped</div>
                </div>
                <div className="text-center p-2 rounded-md bg-red-50 border border-red-200">
                  <div className="text-lg font-semibold text-red-700">{bulkResult.summary.failed}</div>
                  <div className="text-xs text-red-600">Failed</div>
                </div>
              </div>
            </div>

            {/* Per-row errors from import */}
            {bulkResult.errors.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-destructive mb-2">
                  <XCircle className="h-4 w-4" />
                  <span>Errors ({bulkResult.errors.length})</span>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {bulkResult.errors.map((err, i) => (
                    <div key={i} className="text-xs text-destructive/80">
                      Row {err.rowNumber} ({err.email}): {err.error}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Skipped rows */}
            {bulkResult.skipped.length > 0 && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-yellow-700 mb-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Skipped ({bulkResult.skipped.length})</span>
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {bulkResult.skipped.map((s, i) => (
                    <div key={i} className="text-xs text-yellow-700">
                      Row {s.rowNumber} ({s.email}): {s.reason}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Start Import button */}
        {simplifiedValidation && simplifiedValidation.valid.length > 0 && !bulkResult && (
          <button
            type="button"
            disabled={isBulkImporting || !isSupabaseConfigured}
            onClick={handleSimplifiedImport}
            className="w-full rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            {isBulkImporting ? "Importing..." : `Start Import (${simplifiedValidation.valid.length} students)`}
          </button>
        )}

        {/* No valid rows */}
        {simplifiedValidation && simplifiedValidation.valid.length === 0 && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            No valid students to import. Please fix the errors above and re-upload.
          </div>
        )}
      </div>
    );
  }

  // ── Main Render ────────────────────────────────────────────────────────────

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
          {!isSupabaseConfigured && (
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

          {/* Simplified CSV mode — uses bulk upload service */}
          {isSimplifiedMode ? (
            renderSimplifiedMode()
          ) : (
            <>
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
                    disabled={isImporting || !isSupabaseConfigured}
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
            </>
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
