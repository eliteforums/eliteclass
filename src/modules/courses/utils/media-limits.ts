// ---------------------------------------------------------------------------
// Upload limits for LMS media
// ---------------------------------------------------------------------------

export const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500 MB
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB

export function formatMaxSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function validatePdfFile(file: File): string | null {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return "Only PDF files are allowed.";
  if (file.size > MAX_PDF_BYTES) {
    return `PDF must be smaller than ${formatMaxSize(MAX_PDF_BYTES)}.`;
  }
  if (file.size === 0) return "File is empty.";
  return null;
}

export function validateVideoFile(file: File): string | null {
  const isVideo = file.type.startsWith("video/") || /\.(mp4|webm|ogg|mov)$/i.test(file.name);
  if (!isVideo) return "Only video files (MP4, WebM, MOV) are allowed.";
  if (file.size > MAX_VIDEO_BYTES) {
    return `Video must be smaller than ${formatMaxSize(MAX_VIDEO_BYTES)}.`;
  }
  if (file.size === 0) return "File is empty.";
  return null;
}
