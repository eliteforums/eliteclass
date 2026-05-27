import { create } from "zustand";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallState {
  canInstall: boolean;
  isInstalled: boolean;
  isDismissed: boolean;
  deferredPrompt: BeforeInstallPromptEvent | null;
  setDeferredPrompt: (event: BeforeInstallPromptEvent | null) => void;
  triggerInstall: () => Promise<void>;
  dismiss: () => void;
  shouldShowBanner: () => boolean;
  initialize: () => void;
  cleanup: () => void;
}

const DISMISS_KEY = "eliteclass-install-dismissed";
const COOLDOWN_DAYS = 7;

function isDismissedWithinCooldown(): boolean {
  try {
    const timestamp = localStorage.getItem(DISMISS_KEY);
    if (!timestamp) return false;
    const dismissedAt = new Date(timestamp).getTime();
    const cooldownMs = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
    return Date.now() - dismissedAt < cooldownMs;
  } catch {
    return false;
  }
}

let beforeInstallHandler: ((e: Event) => void) | null = null;
let appInstalledHandler: (() => void) | null = null;

export const useInstallStore = create<InstallState>((set, get) => ({
  canInstall: false,
  isInstalled: false,
  isDismissed: isDismissedWithinCooldown(),
  deferredPrompt: null,

  setDeferredPrompt: (event) => set({ deferredPrompt: event, canInstall: !!event }),

  triggerInstall: async () => {
    const { deferredPrompt } = get();
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      set({ isInstalled: true, canInstall: false, deferredPrompt: null });
    }
  },

  dismiss: () => {
    try {
      localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    } catch { /* private browsing */ }
    set({ isDismissed: true });
  },

  shouldShowBanner: () => {
    const { canInstall, isInstalled, isDismissed } = get();
    return canInstall && !isInstalled && !isDismissed;
  },

  initialize: () => {
    if (typeof window === 'undefined') return;

    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      set({ isInstalled: true });
      return;
    }

    beforeInstallHandler = (e: Event) => {
      e.preventDefault();
      set({ deferredPrompt: e as BeforeInstallPromptEvent, canInstall: true });
    };

    appInstalledHandler = () => {
      set({ isInstalled: true, canInstall: false, deferredPrompt: null });
    };

    window.addEventListener('beforeinstallprompt', beforeInstallHandler);
    window.addEventListener('appinstalled', appInstalledHandler);
  },

  cleanup: () => {
    if (typeof window === 'undefined') return;
    if (beforeInstallHandler) window.removeEventListener('beforeinstallprompt', beforeInstallHandler);
    if (appInstalledHandler) window.removeEventListener('appinstalled', appInstalledHandler);
    beforeInstallHandler = null;
    appInstalledHandler = null;
  },
}));
