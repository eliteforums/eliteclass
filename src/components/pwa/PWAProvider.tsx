import { useEffect, useState, type ReactNode } from "react";
import { registerSW, onSWUpdateAvailable, skipWaitingAndReload } from "@/lib/sw-register";
import { useNetworkStore } from "@/store/networkStore";
import { useInstallStore } from "@/store/installStore";
import { useLocationTracking } from "@/hooks/useLocationTracking";
import { OfflineIndicator } from "./OfflineIndicator";
import { InstallBanner } from "./InstallBanner";
import { UpdatePrompt } from "./UpdatePrompt";

interface PWAProviderProps {
  children: ReactNode;
}

export function PWAProvider({ children }: PWAProviderProps) {
  const [showUpdate, setShowUpdate] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Start GPS tracking for authenticated users
  useLocationTracking();

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Initialize stores
    useNetworkStore.getState().initialize();
    useInstallStore.getState().initialize();
    setMounted(true);

    // Register service worker and listen for updates
    onSWUpdateAvailable(() => setShowUpdate(true));
    registerSW();

    return () => {
      useNetworkStore.getState().cleanup();
      useInstallStore.getState().cleanup();
    };
  }, []);

  return (
    <>
      {children}
      {mounted && (
        <>
          <OfflineIndicator />
          <InstallBanner />
          <UpdatePrompt showUpdate={showUpdate} onUpdate={skipWaitingAndReload} />
        </>
      )}
    </>
  );
}
