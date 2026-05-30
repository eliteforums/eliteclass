// ---------------------------------------------------------------------------
// EliteClass — Certificate PDF Generation Service
//
// Client-side PDF generation using jsPDF.
// Renders A4 PORTRAIT certificates matching the EXACT Elite Forums template:
//
// Layout (from the provided offer letter PDF):
// ┌──────────────────────────────────────┐
// │ ████ DARK NAVY HEADER BAR ███████████│  (8mm tall, #2D3748)
// │                                      │
// │  [LOGO]              📞 +91 93225... │  Logo on left, contact on right
// │  ELITE FORUMS        ✉ hello@...    │
// │                      🌐 eliteforums  │
// │                      📍 Vasai, MH    │
// │──────────────────────────────────────│  Horizontal line separator
// │  Elite Forums              Date      │  Company + UDYAM left, date right
// │  UDYAM-MH-17-0099963                │
// │                                      │
// │  Subject: [Title]                    │
// │                                      │
// │  Dear {{student_name}},              │
// │  [Body text...]                      │
// │                                      │
// │  Best Regards,                       │
// │                                      │
// │  [Signature]           [SEAL]        │  Signatory left, seal right
// │  Name                                │
// │  Designation                         │
// │  ELITE FORUMS                        │
// │                                      │
// │ ████ BLUE FOOTER BAR ████████████████│  (8mm tall, #2962FF)
// └──────────────────────────────────────┘
// ---------------------------------------------------------------------------

import { jsPDF } from "jspdf";
import type { CertificateTemplate, CertificateCustomData } from "@/types";

// ── Logo loading helper ──────────────────────────────────────────────────────
// Loads the actual logo from /logo.svg and converts to a data URL for jsPDF.

let logoDataUrl: string | null = null;

async function loadLogoDataUrl(): Promise<string | null> {
  if (logoDataUrl) return logoDataUrl;
  try {
    const response = await fetch("/logo.svg");
    if (!response.ok) return null;
    const svgText = await response.text();
    // Convert SVG to a data URL
    const encoded = btoa(unescape(encodeURIComponent(svgText)));
    logoDataUrl = `data:image/svg+xml;base64,${encoded}`;
    return logoDataUrl;
  } catch {
    return null;
  }
}

async function drawLogo(doc: jsPDF, x: number, y: number, size: number) {
  const dataUrl = await loadLogoDataUrl();
  if (dataUrl) {
    try {
      doc.addImage(dataUrl, "SVG", x, y, size, size);
      return;
    } catch {
      // Fall through to fallback
    }
  }
  // Fallback: draw a simple placeholder rectangle with "EF" text
  doc.setFillColor(33, 33, 33);
  doc.roundedRect(x, y, size, size, 3, 3, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("EF", x + size / 2, y + size / 2 + 3, { align: "center" });
  doc.setTextColor(33, 33, 33);
}

function drawSealPlaceholder(doc: jsPDF, x: number, y: number) {
  // Draw a blank space with a light dashed circle border for physical seal placement
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.5);
  // Dashed circle (approximated with a light circle)
  doc.circle(x, y, 16);
  doc.circle(x, y, 13);

  // Light text indicating seal placement area
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 180, 180);
  doc.text("(Seal)", x, y + 2, { align: "center" });
  doc.setTextColor(33, 33, 33);
}

/**
 * Resolves all `{{...}}` placeholders in the template body text.
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
 * Renders a single certificate page matching the EXACT Elite Forums template.
 * A4 Portrait (210mm × 297mm).
 */
export async function renderCertificatePage(
  doc: jsPDF,
  template: CertificateTemplate,
  studentName: string,
  customData: CertificateCustomData,
): Promise<void> {
  const pageWidth = 210;
  const pageHeight = 297;
  const marginLeft = 22;
  const marginRight = 22;
  const contentWidth = pageWidth - marginLeft - marginRight;
  const rightX = pageWidth - marginRight;

  // ═══════════════════════════════════════════════════════════════════════════
  // DARK HEADER BAR (top)
  // ═══════════════════════════════════════════════════════════════════════════
  doc.setFillColor(45, 55, 72); // dark navy/slate
  doc.rect(0, 0, pageWidth, 8, "F");

  // ═══════════════════════════════════════════════════════════════════════════
  // LOGO + COMPANY NAME (left side)
  // ═══════════════════════════════════════════════════════════════════════════
  await drawLogo(doc, marginLeft, 14, 22);

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(33, 33, 33);
  doc.text("ELITE FORUMS", marginLeft, 44);

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 120);
  doc.text("UNLOCKING YOUR IT POTENTIAL", marginLeft, 48);

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTACT INFO (right side) with icons
  // ═══════════════════════════════════════════════════════════════════════════
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);

  let contactY = 18;
  // Phone
  doc.setFontSize(9);
  doc.text("+91 93225 10601", rightX, contactY, { align: "right" });
  contactY += 6;
  // Email
  doc.text("hello@eliteforums.in", rightX, contactY, { align: "right" });
  contactY += 6;
  // Website
  doc.text("eliteforums.in", rightX, contactY, { align: "right" });
  contactY += 6;
  // Address
  doc.text("Vasai, MH 401208", rightX, contactY, { align: "right" });

  // ═══════════════════════════════════════════════════════════════════════════
  // HORIZONTAL SEPARATOR LINE
  // ═══════════════════════════════════════════════════════════════════════════
  doc.setDrawColor(45, 55, 72);
  doc.setLineWidth(0.8);
  doc.line(marginLeft, 54, rightX, 54);

  // ═══════════════════════════════════════════════════════════════════════════
  // COMPANY NAME + UDYAM (left) | DATE (right)
  // ═══════════════════════════════════════════════════════════════════════════
  let y = 64;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(33, 33, 33);
  doc.text("Elite Forums", marginLeft, y);

  // Date on right
  const dateStr = customData.date_issued ||
    new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "2-digit" });
  doc.text(dateStr, rightX, y, { align: "right" });

  y += 5;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("UDYAM-MH-17-0099963", marginLeft, y);

  // ═══════════════════════════════════════════════════════════════════════════
  // SUBJECT LINE
  // ═══════════════════════════════════════════════════════════════════════════
  y += 12;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(33, 33, 33);

  const resolvedTitle = resolvePlaceholders(template.title, studentName, customData);
  doc.text(`Subject: ${resolvedTitle}`, marginLeft, y);

  // ═══════════════════════════════════════════════════════════════════════════
  // BODY TEXT (with resolved placeholders)
  // ═══════════════════════════════════════════════════════════════════════════
  y += 10;
  const resolvedBody = resolvePlaceholders(template.body_text, studentName, customData);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(33, 33, 33);

  // Split body into lines that fit the content width
  const lines = doc.splitTextToSize(resolvedBody, contentWidth);
  const lineHeight = 4.8;

  // Render body text
  doc.text(lines, marginLeft, y);
  y += lines.length * lineHeight;

  // ═══════════════════════════════════════════════════════════════════════════
  // "Best Regards,"
  // ═══════════════════════════════════════════════════════════════════════════
  y += 14;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bolditalic");
  doc.setTextColor(33, 33, 33);
  doc.text("Best Regards,", marginLeft, y);

  // ═══════════════════════════════════════════════════════════════════════════
  // SIGNATORY (bottom-left) + COMPANY SEAL (bottom-right)
  // ═══════════════════════════════════════════════════════════════════════════
  // Position signatory area - ensure it's not too close to footer
  const signatoryY = Math.max(y + 20, pageHeight - 65);

  // Signatory name
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(33, 33, 33);
  doc.text(template.signatory_name, marginLeft, signatoryY);

  // Designation
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(template.signatory_designation, marginLeft, signatoryY + 5);

  // Company name
  doc.setFont("helvetica", "bold");
  doc.text("ELITE FORUMS", marginLeft, signatoryY + 10);

  // Company seal placeholder (right side) — blank space for physical seal
  drawSealPlaceholder(doc, rightX - 20, signatoryY);

  // ═══════════════════════════════════════════════════════════════════════════
  // BLUE FOOTER BAR (bottom)
  // ═══════════════════════════════════════════════════════════════════════════
  doc.setFillColor(41, 98, 255); // bright blue
  doc.rect(0, pageHeight - 8, pageWidth, 8, "F");
}

/**
 * Generates a combined multi-page PDF for all provided students.
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
 * Generates a single certificate PDF.
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
