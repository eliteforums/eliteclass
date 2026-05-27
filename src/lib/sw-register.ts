// src/lib/sw-register.ts

type UpdateCallback = () => void;

let updateCallback: UpdateCallback | null = null;

/**
 * Register the service worker in production mode only.
 * Returns the registration or null if SW is not supported/available.
 */
export async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined') return null;
  if (!import.meta.env.PROD) return null;
  if (!('serviceWorker' in navigator)) return null;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    // Listen for updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New SW installed while old one is still active
          updateCallback?.();
        }
      });
    });

    return registration;
  } catch (error) {
    console.error('[SW] Registration failed:', error);
    return null;
  }
}

/**
 * Set a callback to be invoked when a new service worker version is available.
 */
export function onSWUpdateAvailable(callback: UpdateCallback): void {
  updateCallback = callback;
}

/**
 * Tell the waiting service worker to skip waiting and take over.
 * After calling this, the page should be reloaded.
 */
export async function skipWaitingAndReload(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration();
  if (registration?.waiting) {
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
  // Reload after a brief delay to let the new SW activate
  setTimeout(() => window.location.reload(), 300);
}
