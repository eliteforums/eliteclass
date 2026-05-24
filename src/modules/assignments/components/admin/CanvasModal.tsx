import { useState, useRef } from "react";
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

interface CanvasModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CanvasModal({ isOpen, onClose }: CanvasModalProps) {
  const [pages, setPages] = useState<any[]>([]);
  const [isExporting, setIsExporting] = useState(false);

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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Canvas</DialogTitle>
          <DialogDescription>Draw using the canvas editor or export as PDF.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Canvas pages</div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPages([{ objects: [] }])}>
                New Blank Canvas
              </Button>
              <Button onClick={handleSavePdf} disabled={isExporting || pages.length === 0}>
                {isExporting ? "Exporting..." : "Export PDF"}
              </Button>
              <Button variant="ghost" onClick={onClose}>
                <X />
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
