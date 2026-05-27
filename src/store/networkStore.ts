import { create } from "zustand";

interface NetworkState {
  isOnline: boolean;
  lastOnlineAt: number | null;
  setOnline: (online: boolean) => void;
  initialize: () => void;
  cleanup: () => void;
}

let onlineHandler: (() => void) | null = null;
let offlineHandler: (() => void) | null = null;

export const useNetworkStore = create<NetworkState>((set) => ({
  isOnline: true, // Default to online; initialize() syncs actual state on client
  lastOnlineAt: null,
  setOnline: (online) => set({ 
    isOnline: online,
    ...(online ? { lastOnlineAt: Date.now() } : {}),
  }),
  initialize: () => {
    if (typeof window === 'undefined') return;
    // Use navigator.onLine as initial hint, but verify with a real fetch
    const browserOnline = navigator.onLine;
    set({ isOnline: browserOnline });
    
    // Double-check with actual connectivity test if browser says offline
    if (!browserOnline) {
      fetch('/favicon.ico', { method: 'HEAD', cache: 'no-store' })
        .then(() => set({ isOnline: true }))
        .catch(() => {/* confirmed offline */});
    }
    
    const store = useNetworkStore.getState();
    onlineHandler = () => store.setOnline(true);
    offlineHandler = () => store.setOnline(false);
    window.addEventListener('online', onlineHandler);
    window.addEventListener('offline', offlineHandler);
  },
  cleanup: () => {
    if (typeof window === 'undefined') return;
    if (onlineHandler) window.removeEventListener('online', onlineHandler);
    if (offlineHandler) window.removeEventListener('offline', offlineHandler);
    onlineHandler = null;
    offlineHandler = null;
  },
}));
