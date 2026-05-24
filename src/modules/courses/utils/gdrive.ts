export function isGoogleDriveUrl(url: string): boolean {
  return url.includes("drive.google.com/file/d/") || url.includes("drive.google.com/open?id=");
}

export function parseGoogleDriveUrl(url: string): {
  ok: boolean;
  embedUrl?: string;
  error?: string;
} {
  const match = url.match(/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/);
  if (!match) return { ok: false, error: "Invalid Google Drive link format." };
  return { ok: true, embedUrl: `https://drive.google.com/file/d/${match[1]}/preview` };
}
