type UploadResult = { id?: string; webViewLink?: string } | null;

async function uploadPdf(blob: Blob, filename = 'notebook.pdf', onProgress?: (p: number) => void): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', blob, filename);

  const res = await fetch('/upload-pdf', { method: 'POST', body: form });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}

export default { uploadPdf };
