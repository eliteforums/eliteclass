import { Download, X } from "lucide-react";
import { useInstallStore } from "@/store/installStore";
import { Button } from "@/components/ui/button";

export function InstallBanner() {
  const { shouldShowBanner, triggerInstall, dismiss } = useInstallStore();

  if (!shouldShowBanner()) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-sm rounded-lg border bg-card p-4 shadow-lg sm:left-auto sm:right-4">
      <button
        onClick={dismiss}
        aria-label="Dismiss install banner"
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Download className="h-5 w-5 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold">Install EliteClass</p>
          <p className="text-xs text-muted-foreground">
            Install for quick access, offline support, and a native app experience.
          </p>
        </div>
      </div>

      <Button onClick={triggerInstall} size="sm" className="mt-3 w-full">
        Install
      </Button>
    </div>
  );
}
