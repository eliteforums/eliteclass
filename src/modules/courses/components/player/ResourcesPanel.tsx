// ---------------------------------------------------------------------------
// ResourcesPanel — downloadable lesson materials tab content
// ---------------------------------------------------------------------------

import { useState } from "react";
import type { ComponentType } from "react";
import {
  FileText,
  File,
  Image,
  Archive,
  MonitorPlay,
  Download,
  Eye,
  PackageOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { LmsLesson, LmsLessonMaterial } from "@/types";

// ── File type config ──────────────────────────────────────────────────────────

interface FileTypeConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: ComponentType<any>;
  iconClass: string;
  label: string;
}

function getFileTypeConfig(fileType: string): FileTypeConfig {
  const t = fileType.toLowerCase();
  if (t.includes("pdf")) return { icon: FileText, iconClass: "text-rose-500", label: "PDF" };
  if (t.includes("word") || t.includes("doc"))
    return { icon: FileText, iconClass: "text-blue-500", label: "Word" };
  if (t.includes("ppt") || t.includes("presentation"))
    return { icon: MonitorPlay, iconClass: "text-orange-500", label: "PowerPoint" };
  if (t.includes("zip") || t.includes("rar") || t.includes("tar"))
    return { icon: Archive, iconClass: "text-yellow-500", label: "Archive" };
  if (
    t.includes("image") ||
    t.includes("png") ||
    t.includes("jpg") ||
    t.includes("jpeg") ||
    t.includes("gif")
  )
    return { icon: Image, iconClass: "text-emerald-500", label: "Image" };
  if (t.includes("excel") || t.includes("sheet") || t.includes("csv"))
    return { icon: File, iconClass: "text-green-600", label: "Spreadsheet" };
  return { icon: File, iconClass: "text-muted-foreground", label: "File" };
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ResourcesPanelProps {
  lesson: LmsLesson;
  materials: LmsLessonMaterial[];
  instituteId: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ResourcesPanel({ lesson, materials, instituteId }: ResourcesPanelProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  if (!materials || materials.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <PackageOpen className="size-12 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No resources for this lesson.</p>
      </div>
    );
  }

  const resolveUrl = async (material: LmsLessonMaterial) => {
    const { resolveMaterialUrl } =
      await import("@/modules/courses/services/lesson-content.service");
    const res = await resolveMaterialUrl(material);
    if (!res.success || !res.data) {
      throw new Error(res.error ?? "Failed to generate download link");
    }
    return res.data;
  };

  const handleDownload = async (material: LmsLessonMaterial) => {
    setLoadingId(material.id);
    try {
      const url = await resolveUrl(material);
      const a = document.createElement("a");
      a.href = url;
      a.download = material.title;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setLoadingId(null);
    }
  };

  const handlePreview = async (material: LmsLessonMaterial) => {
    setLoadingId(material.id);
    try {
      const url = await resolveUrl(material);
      setPreviewUrl(url);
      setPreviewTitle(material.title);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setLoadingId(null);
    }
  };

  const isPdf = (material: LmsLessonMaterial) => material.file_type.toLowerCase().includes("pdf");

  // Unused but referenced in the prop signature
  void lesson;
  void instituteId;

  return (
    <>
      <ScrollArea className="max-h-80">
        <ul className="space-y-2 p-1">
          {materials.map((material) => {
            const { icon: Icon, iconClass, label } = getFileTypeConfig(material.file_type);
            const isLoading = loadingId === material.id;

            return (
              <li
                key={material.id}
                className="flex items-center gap-3 rounded-lg border border-border/60 bg-card p-3 transition-colors hover:bg-accent/40"
              >
                {/* File icon */}
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon className={cn("size-5", iconClass)} aria-label={label} />
                </div>

                {/* Title + size */}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{material.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {label} &bull; {formatFileSize(material.file_size_bytes)}
                  </p>
                </div>

                {/* Action buttons */}
                <div className="flex shrink-0 items-center gap-1">
                  {isPdf(material) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => void handlePreview(material)}
                      disabled={isLoading}
                      aria-label={`Preview ${material.title}`}
                    >
                      <Eye className="size-4" />
                    </Button>
                  )}
                  {material.is_downloadable && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => void handleDownload(material)}
                      disabled={isLoading}
                      aria-label={`Download ${material.title}`}
                    >
                      {isLoading ? (
                        <div className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      ) : (
                        <Download className="size-4" />
                      )}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </ScrollArea>

      {/* PDF preview dialog */}
      <Dialog
        open={!!previewUrl}
        onOpenChange={(open) => {
          if (!open) setPreviewUrl(null);
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="truncate">{previewTitle}</DialogTitle>
          </DialogHeader>
          <div className="relative h-[70vh] w-full overflow-hidden rounded-md border border-border">
            {previewUrl && (
              <iframe
                src={previewUrl}
                title={previewTitle}
                className="size-full"
                aria-label={`Preview of ${previewTitle}`}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
