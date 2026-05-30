import { useState, useRef, useEffect } from "react";
import { X, Download, Upload } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import CanvasEditor from "@/components/canvas/CanvasEditor";
import generateAssignmentPdf from "@/services/pdf/generateAssignmentPdf";
import { toast } from "sonner";

const CANVAS_STORAGE_KEY = "eliteclass-canvas-draft";

interface CanvasModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CanvasModal({ isOpen, onClose }: CanvasModalProps) {
  const [pages, setPages] = useState<any[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  // Load saved canvas from localStorage on open
  useEffect(() => {
    if (isOpen) {
      try {
        const saved = localStorage.getItem(CANVAS_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setPages(parsed);
            setLastSaved("Loaded from saved draft");
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
  }, [isOpen]);

  // Auto-save on canvas change (debounced)
  useEffect(() => {
    if (pages.length === 0) return;
    
    const timeout = setTimeout(() => {
      try {
        localStorage.setItem(CANVAS_STORAGE_KEY, JSON.stringify(pages));
        setLastSaved(`Saved at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
      } catch {
        // Storage full — ignore
      }
    }, 1000); // 1 second debounce

    return () => clearTimeout(timeout);
  }, [pages]);

  const handleSave = () => {
    setIsSaving(true);
    try {
      localStorage.setItem(CANVAS_STORAGE_KEY, JSON.stringify(pages));
      setLastSaved(`Saved at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
      toast.success("Canvas saved successfully!");
    } catch {
      toast.error("Failed to save canvas (storage may be full).");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePdf = async () => {
    try {
      setIsExporting(true);
      const res = await generateAssignmentPdf(pages, { filename: "canvas.pdf", returnBlob: false });
      toast.success("Canvas exported (check downloads)");
    } catch (err) {
      console.error(err);
      toast.error("Failed to export canvas");
    } finally {
      setIsExporting(false);
    }
  };

  const handleClearDraft = () => {
    localStorage.removeItem(CANVAS_STORAGE_KEY);
    setPages([]);
    setLastSaved(null);
    toast.success("Draft cleared");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Canvas</DialogTitle>
          <DialogDescription>Draw using the canvas editor. Your work is auto-saved.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {lastSaved ? `✓ ${lastSaved}` : "Canvas pages"}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPages([{ objects: [] }])}>
                New Blank Canvas
              </Button>
              <Button variant="outline" size="sm" onClick={handleClearDraft}>
                Clear Draft
              </Button>
              <Button variant="outline" onClick={handleSave} disabled={isSaving || pages.length === 0}>
                {isSaving ? "Saving..." : "Save"}
              </Button>
              <Button onClick={handleSavePdf} disabled={isExporting || pages.length === 0}>
                {isExporting ? "Exporting..." : "Export PDF"}
              </Button>
            </div>
          </div>

          <div className="rounded-3xl bg-background p-0 shadow-none">
            <CanvasEditor pages={pages} onChange={(p) => setPages(p)} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default CanvasModal;
