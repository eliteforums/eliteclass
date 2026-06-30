// ---------------------------------------------------------------------------
// UpdatePrompt — floating "Update available" pill for web + PWA
// ---------------------------------------------------------------------------
// Renders a fixed bottom-right pill with a refresh icon when a new build is
// available. Clicking it calls `applyUpdate()` from useAppUpdate, which
// either skip-waits the SW (PWA path) or hard-reloads the page (web path).
//
// Visible everywhere because it's mounted inside PWAProvider at the root.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface UpdatePromptProps {
  showUpdate: boolean;
  onUpdate: () => void;
}

const DISMISS_KEY = "eliteclass-update-dismissed-version";

export function UpdatePrompt({ showUpdate, onUpdate }: UpdatePromptProps) {
  const [dismissed, setDismissed] = useState(false);
  const [applying, setApplying] = useState(false);

  // Reset dismissal when a new update flag fires (different version)
  useEffect(() => {
    if (showUpdate) setDismissed(false);
  }, [showUpdate]);

  // Persist dismissal across reloads keyed by current build version so a
  // re-deploy can still show the prompt even if the user dismissed earlier.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const baked = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "";
    const stored = window.localStorage.getItem(DISMISS_KEY);
    if (showUpdate && stored && stored !== baked) {
      // Different build than the one previously dismissed — show again.
      window.localStorage.removeItem(DISMISS_KEY);
    }
  }, [showUpdate]);

  const handleApply = () => {
    setApplying(true);
    onUpdate();
  };

  const handleDismiss = () => {
    setDismissed(true);
    const baked = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "";
    if (baked && typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_KEY, baked);
    }
  };

  const visible = showUpdate && !dismissed;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.95 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed bottom-4 right-4 z-[100] max-w-[calc(100vw-2rem)] sm:max-w-md"
          role="status"
          aria-live="polite"
        >
          <div className="rounded-2xl border border-primary/40 bg-card shadow-2xl backdrop-blur-md overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-primary via-blue-500 to-violet-500" />
            <div className="p-4 flex items-center gap-3">
              <div className="size-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <Sparkles className="size-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm">A new version is available</p>
                <p className="text-xs text-muted-foreground leading-snug">
                  Reload to get the latest features and fixes.
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="sm"
                  onClick={handleApply}
                  disabled={applying}
                  className={cn("gap-1.5", applying && "opacity-80")}
                >
                  <RefreshCw className={cn("size-3.5", applying && "animate-spin")} />
                  {applying ? "Updating..." : "Update"}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleDismiss}
                  className="size-8"
                  aria-label="Dismiss update prompt"
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
