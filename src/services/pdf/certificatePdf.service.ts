// ---------------------------------------------------------------------------
// EliteClass — Certificate PDF Generation Service
//
// Client-side PDF generation using jsPDF.
// Renders A4 landscape certificates with placeholder resolution.
// ---------------------------------------------------------------------------

import { jsPDF } from "jspdf";
import type { CertificateTemplate, CertificateCustomData } from "@/types";

/**
 * Resolves all `{{...}}` placeholders in the template body text with actual
 * student data. Missing values are substituted as empty strings.
 */
export function resolvePlaceholders(
  bodyText: string,
  studentName: string,
  customData: CertificateCustomData,
): string {
  let result = bodyText;
  result = result.replaceAll("{{student_name}}", studentName || "");
  result = result.replaceAll("{{start_date}}", customData.start_date || "");
  result = result.replaceAll("{{end_date}}", customData.end_date || "");
  result = result.replaceAll("{{role}}", customData.role || "");
  result = result.replaceAll("{{batch_name}}", customData.batch_name || "");
  result = result.replaceAll("{{course_name}}", customData.course_name || "");
  result = result.replaceAll(
    "{{date_issued}}",
    customData.date_issued || new Date().toLocaleDateString(),
  );
  return result;
}

/**
 * Renders a single certificate page onto the provided jsPDF document.
 * Layout: A4 landscape (297mm × 210mm).
 */
export async function renderCertificatePage(
  doc: jsPDF,
  template: CertificateTemplate,
  studentName: string,
  customData: CertificateCustomData,
): Promise<void> {
  const pageWidth = 297; // A4 landscape
  const pageHeight = 210;

  // Background
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageWidth, pageHeight, "F");

  // Border
  doc.setDrawColor(41, 98, 255);
  doc.setLineWidth(2);
  doc.rect(8, 8, pageWidth - 16, pageHeight - 16);

  // Title
  doc.setFontSize(24);
  doc.setFont("helvetica", "bold");
  doc.text(template.title, pageWidth / 2, 40, { align: "center" });

  // Body text with resolved placeholders
  const resolvedBody = resolvePlaceholders(template.body_text, studentName, customData);
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  const lines = doc.splitTextToSize(resolvedBody, pageWidth - 60);
  doc.text(lines, 30, 70);

  // Signatory (bottom-right)
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(template.signatory_name, pageWidth - 40, pageHeight - 40, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(template.signatory_designation, pageWidth - 40, pageHeight - 33, { align: "right" });
}

/**
 * Generates a combined multi-page PDF for all provided students.
 * Returns a Blob for browser download.
 */
export async function generateBulkCertificatePdf(
  template: CertificateTemplate,
  students: Array<{ name: string; customData: CertificateCustomData }>,
  onProgress?: (current: number, total: number) => void,
): Promise<Blob> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  for (let i = 0; i < students.length; i++) {
    if (i > 0) doc.addPage();
    await renderCertificatePage(doc, template, students[i].name, students[i].customData);
    onProgress?.(i + 1, students.length);
  }

  return doc.output("blob");
}

/**
 * Generates a single certificate PDF and returns it as a Blob.
 */
export async function generateSingleCertificatePdf(
  template: CertificateTemplate,
  studentName: string,
  customData: CertificateCustomData,
): Promise<Blob> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  await renderCertificatePage(doc, template, studentName, customData);
  return doc.output("blob");
}
