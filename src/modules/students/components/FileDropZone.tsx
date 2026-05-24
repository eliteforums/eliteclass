import React from "react";

interface Props {
  onFile: (file: File) => void;
}

export function FileDropZone({ onFile }: Props) {
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  }

  return (
    <div onDrop={handleDrop} onDragOver={(e) => e.preventDefault()} className="rounded-lg border border-dashed border-border p-6 text-center bg-muted/10">
      <p className="text-sm text-muted-foreground">Drag & drop your file here, or use Upload</p>
    </div>
  );
}

export default FileDropZone;
