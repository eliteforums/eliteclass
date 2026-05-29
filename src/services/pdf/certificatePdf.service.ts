// ---------------------------------------------------------------------------
// EliteClass — Certificate PDF Generation Service
//
// Client-side PDF generation using jsPDF.
// Renders A4 PORTRAIT certificates matching the Elite Forums template:
// - Dark header bar
// - Company name + contact info
// - Horizontal separator
// - Date + UDYAM number
// - Subject line
// - Body text with placeholders
// - Signatory + company seal area
// - Blue footer bar
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
    customData.date_issued || new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "2-digit" }),
  );
  return result;
}

/**
 * Renders a single certificate page matching the Elite Forums template.
 * Layout: A4 Portrait (210mm × 297mm).
 *
 * Template structure:
 * ┌──────────────────────────────────────┐
 * │ ████████ DARK HEADER BAR ████████████│
 * │                                      │
 * │  ELITE FORUMS        📞 +91 93225... │
 * │  (logo area)         ✉ hello@...     │
 * │                      🌐 eliteforums  │
 * │                      📍 Vasai, MH    │
 * │──────────────────────────────────────│
 * │  Elite Forums              May 01... │
 * │  UDYAM-MH-17-0099963                │
 * │                                      │
 * │  Subject: Offer Letter for...        │
 * │                                      │
 * │  Dear {{student_name}},              │
 * │  Body text...                        │
 * │                                      │
 * │  Best Regards,                       │
 * │                                      │
 * │  Signatory Name        [SEAL]        │
 * │  Designation                         │
 * │  ELITE FORUMS                        │
 * │                                      │
 * │ ████████ BLUE FOOTER BAR ████████████│
 * └──────────────────────────────────────┘
 */
export async function renderCertificatePage(
  doc: jsPDF,
  template: CertificateTemplate,
  studentName: string,
  customData: CertificateCustomData,
): Promise<void> {
  const pageWidth = 210; // A4 portrait
  const pageHeight = 297;
  const marginLeft = 20;
  const marginRight = 20;
  const contentWidth = pageWidth - marginLeft - marginRight;

  // ── Dark header bar (top) ──────────────────────────────────────────────
  doc.setFillColor(45, 55, 72); // dark slate
  doc.rect(0, 0, pageWidth, 8, "F");

  // ── Company name (left side) ───────────────────────────────────────────
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(33, 33, 33);
  doc.text("ELITE FORUMS", marginLeft, 28);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("UNLOCKING YOUR IT POTENTIAL", marginLeft, 33);

  // ── Contact info (right side) ──────────────────────────────────────────
  const rightX = pageWidth - marginRight;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  doc.text("+91 93225 10601", rightX, 18, { align: "right" });
  doc.text("hello@eliteforums.in", rightX, 24, { align: "right" });
  doc.text("eliteforums.in", rightX, 30, { align: "right" });
  doc.text("Vasai, MH 401208", rightX, 36, { align: "right" });

  // ── Horizontal separator ───────────────────────────────────────────────
  doc.setDrawColor(45, 55, 72);
  doc.setLineWidth(0.8);
  doc.line(marginLeft, 42, pageWidth - marginRight, 42);

  // ── Company name + UDYAM (left) and Date (right) ───────────────────────
  let y = 52;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(33, 33, 33);
  doc.text("Elite Forums", marginLeft, y);

  // Date on right
  const dateStr = customData.date_issued || new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "2-digit" });
  doc.text(dateStr, rightX, y, { align: "right" });

  y += 5;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("UDYAM-MH-17-0099963", marginLeft, y);

  // ── Subject line ───────────────────────────────────────────────────────
  y += 12;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(33, 33, 33);
  doc.text(`Subject: ${template.title}`, marginLeft, y);

  // ── Body text ──────────────────────────────────────────────────────────
  y += 10;
  const resolvedBody = resolvePlaceholders(template.body_text, studentName, customData);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(33, 33, 33);

  const lines = doc.splitTextToSize(resolvedBody, contentWidth);
  doc.text(lines, marginLeft, y);

  // Calculate where body text ends
  const lineHeight = 4.5;
  y += lines.length * lineHeight;

  // ── "Best Regards," ────────────────────────────────────────────────────
  y += 12;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bolditalic");
  doc.text("Best Regards,", marginLeft, y);

  // ── Signatory (bottom-left) ────────────────────────────────────────────
  y += 18;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(33, 33, 33);
  doc.text(template.signatory_name, marginLeft, y);

  y += 5;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(template.signatory_designation, marginLeft, y);

  y += 5;
  doc.setFont("helvetica", "bold");
  doc.text("ELITE FORUMS", marginLeft, y);

  // ── Company seal area (bottom-right) ───────────────────────────────────
  // Draw a circle to represent the seal
  const sealX = pageWidth - marginRight - 20;
  const sealY = y - 10;
  doc.setDrawColor(45, 55, 72);
  doc.setLineWidth(1.5);
  doc.circle(sealX, sealY, 15);

  // Seal text
  doc.setFontSize(6);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(45, 55, 72);
  doc.text("ELITE FORUMS", sealX, sealY - 3, { align: "center" });
  doc.setFontSize(8);
  doc.text("ESTD", sealX, sealY + 2, { align: "center" });
  doc.text("2023", sealX, sealY + 6, { align: "center" });

  // ── Blue footer bar (bottom) ───────────────────────────────────────────
  doc.setFillColor(41, 98, 255); // blue
  doc.rect(0, pageHeight - 8, pageWidth, 8, "F");
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
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

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
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  await renderCertificatePage(doc, template, studentName, customData);
  return doc.output("blob");
}
