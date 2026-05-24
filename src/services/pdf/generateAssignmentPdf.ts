import { jsPDF } from 'jspdf';
import { getWhiteboardSize, type WhiteboardPage } from './whiteboardRender';

/**
 * Robust multi-page PDF export for the Assignment Canvas System.
 * Maps each 1000x700 segment of the canvas to a separate PDF page.
 */
export default async function generateAssignmentPdf(pages: WhiteboardPage[], opts?: { filename?: string; returnBlob?: boolean }) {
  // Ensure we are in a browser environment
  if (typeof document === 'undefined') throw new Error('generateAssignmentPdf can only be used in the browser');

  const filename = opts?.filename || 'assignment.pdf';

  // Constants as per requirements
  const PAGE_WIDTH = 1000;
  const PAGE_HEIGHT = 700;

  // Fallback for empty pages - must have at least one page
  const exportPages = (pages && pages.length > 0)
    ? pages
    : [{ id: 'empty', objects: [], width: PAGE_WIDTH, height: PAGE_HEIGHT, background: '#ffffff', dataUrl: '' } as WhiteboardPage];

  /**
   * Helper to load images safely
   */
  const loadImage = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      if (!src) return reject(new Error('Empty image source'));
      const image = new Image();
      // Only set crossOrigin for non-data URLs to avoid security errors
      if (!src.startsWith('data:')) {
        image.crossOrigin = 'anonymous';
      }
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Failed to load image'));
      image.src = src;
    });

  try {
    // Initialize PDF with correct orientation and size
    // Using named import for jsPDF for better compatibility
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [PAGE_WIDTH, PAGE_HEIGHT],
      hotfixes: ['px_scaling'],
    });

    let isFirstPage = true;

    // Process each whiteboard page
    for (const page of exportPages) {
      const { width: sourceWidth, height: sourceHeight } = getWhiteboardSize(page);
      
      // Calculate how many segments we need to split this page into (e.g., if it's a tall canvas)
      const numSegments = Math.max(1, Math.ceil(sourceHeight / PAGE_HEIGHT));
      
      let sourceImage: HTMLImageElement | null = null;
      if (page.dataUrl) {
        try {
          sourceImage = await loadImage(page.dataUrl);
        } catch (err) {
          console.warn('PDF Export: Failed to load page image, using blank background', err);
        }
      }

      for (let i = 0; i < numSegments; i++) {
        // Add a new page if it's not the very first page of the document
        if (!isFirstPage) {
          pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT], 'landscape');
        }
        isFirstPage = false;

        // Create a temporary canvas to extract the specific 1000x700 segment
        const segmentCanvas = document.createElement('canvas');
        segmentCanvas.width = PAGE_WIDTH;
        segmentCanvas.height = PAGE_HEIGHT;
        const ctx = segmentCanvas.getContext('2d');

        if (ctx) {
          // 1. Fill background
          ctx.fillStyle = page.background || '#ffffff';
          ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

          // 2. Draw the segment of the drawing canvas
          if (sourceImage) {
            const segmentY = i * PAGE_HEIGHT;
            ctx.drawImage(
              sourceImage,
              0, segmentY, sourceWidth, PAGE_HEIGHT, // Source segment
              0, 0, PAGE_WIDTH, PAGE_HEIGHT          // Destination
            );
          }

          // 3. Add to PDF
          const imgData = segmentCanvas.toDataURL('image/png', 1.0);
          pdf.addImage(
            imgData,
            'PNG',
            0,
            0,
            PAGE_WIDTH,
            PAGE_HEIGHT,
            undefined,
            'FAST'
          );
        }
      }
    }

    if (opts?.returnBlob) {
      // @ts-ignore jsPDF output signatures vary
      return pdf.output('blob');
    }

    pdf.save(filename);
    return true;
  } catch (error) {
    console.error('CRITICAL: PDF Export Error:', error);
    throw error;
  }
}

