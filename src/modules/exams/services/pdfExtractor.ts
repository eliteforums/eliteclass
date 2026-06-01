import * as pdfjsLib from "pdfjs-dist";

// Use inline fake worker to avoid CDN fetch issues in PWA/service worker contexts.
// The "fake worker" mode runs PDF.js synchronously in the main thread — slightly
// slower for large PDFs but avoids all cross-origin and module loading issues.
pdfjsLib.GlobalWorkerOptions.workerSrc = "";

export async function extractTextFromPdf(
  file: File,
  onProgress?: (page: number, total: number) => void
): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    useWorkerFetch: false,
    useSystemFonts: true,
  } as any).promise;
  const totalPages = pdf.numPages;
  let fullText = "";

  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(" ");
    fullText += pageText + "\n\n";
    onProgress?.(i, totalPages);
  }

  return fullText.trim();
}
