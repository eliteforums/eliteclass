/**
 * Exam Security Utilities
 * Provides functions for browser fingerprinting, device identification,
 * and other security measures for secure online examinations
 */

/**
 * Generate browser fingerprint using available browser APIs
 * NOT cryptographically secure - just for fraud detection
 */
export function generateBrowserFingerprint(): string {
  const fingerprint = {
    // Screen info
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    screenColorDepth: window.screen.colorDepth,
    screenPixelDepth: window.screen.pixelDepth,
    
    // Timezone
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timezoneOffset: new Date().getTimezoneOffset(),
    
    // Language
    language: navigator.language,
    languages: Array.from(navigator.languages || []).join(','),
    
    // Hardware concurrency
    hardwareConcurrency: navigator.hardwareConcurrency || 0,
    deviceMemory: (navigator as any).deviceMemory || 0,
    
    // WebGL info
    webglVendor: getWebGLVendor(),
    webglRenderer: getWebGLRenderer(),
    
    // Canvas fingerprint
    canvasFingerprint: getCanvasFingerprint(),
  };

  // Create a simple hash
  return btoa(JSON.stringify(fingerprint)).substring(0, 64);
}

/**
 * Get WebGL vendor information
 */
function getWebGLVendor(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return 'N/A';
    
    const debugInfo = (gl as any).getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      return (gl as any).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    }
  } catch (e) {
    // Fallback for restricted environments
  }
  return 'N/A';
}

/**
 * Get WebGL renderer information
 */
function getWebGLRenderer(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return 'N/A';
    
    const debugInfo = (gl as any).getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      return (gl as any).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    }
  } catch (e) {
    // Fallback
  }
  return 'N/A';
}

/**
 * Generate canvas fingerprint
 * More unique identifier based on text rendering
 */
function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'N/A';
    
    const text = 'EduOS Exam Security';
    ctx.font = '16px Arial';
    ctx.fillStyle = '#000';
    ctx.fillText(text, 2, 2);
    
    // Get image data hash (simple)
    return canvas.toDataURL().substring(0, 32);
  } catch (e) {
    return 'N/A';
  }
}

/**
 * Generate device ID using localStorage + fingerprint
 * Persists across sessions
 */
export function getOrCreateDeviceId(): string {
  const DEVICE_ID_KEY = 'eduos_exam_device_id';
  
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  
  return deviceId;
}

/**
 * Get client IP address via external API
 * Fallback: use 'unknown'
 */
export async function getClientIpAddress(): Promise<string> {
  try {
    // Try using fetch if available
    const response = await fetch('https://api.ipify.org?format=json', {
      mode: 'cors',
      cache: 'no-cache',
    });
    const data = await response.json();
    return data.ip || 'unknown';
  } catch (error) {
    // Fallback: return unknown
    return 'unknown';
  }
}

/**
 * Detect fullscreen mode
 */
export function isFullscreenActive(): boolean {
  return !!(
    document.fullscreenElement ||
    (document as any).webkitFullscreenElement ||
    (document as any).mozFullScreenElement ||
    (document as any).msFullscreenElement
  );
}

/**
 * Request fullscreen mode
 */
export async function requestFullscreen(element: HTMLElement = document.documentElement): Promise<void> {
  try {
    if (element.requestFullscreen) {
      await element.requestFullscreen();
    } else if ((element as any).webkitRequestFullscreen) {
      (element as any).webkitRequestFullscreen();
    } else if ((element as any).mozRequestFullScreen) {
      (element as any).mozRequestFullScreen();
    } else if ((element as any).msRequestFullscreen) {
      (element as any).msRequestFullscreen();
    }
  } catch (error) {
    console.warn('Fullscreen request failed:', error);
  }
}

/**
 * Exit fullscreen mode
 */
export async function exitFullscreen(): Promise<void> {
  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
    } else if ((document as any).webkitExitFullscreen) {
      (document as any).webkitExitFullscreen();
    } else if ((document as any).mozCancelFullScreen) {
      (document as any).mozCancelFullScreen();
    } else if ((document as any).msExitFullscreen) {
      (document as any).msExitFullscreen();
    }
  } catch (error) {
    console.warn('Fullscreen exit failed:', error);
  }
}

/**
 * Check if page visibility is hidden
 */
export function isPageHidden(): boolean {
  return document.hidden;
}

/**
 * Get current timestamp from server-side via browser
 * Returns high-resolution timestamp for timer accuracy
 */
export function getCurrentTimestamp(): number {
  return performance.now() || Date.now();
}

/**
 * Format time remaining in exam (MM:SS format)
 */
export function formatTimeRemaining(secondsLeft: number): string {
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Check if time is critically low (less than 5 minutes)
 */
export function isTimeCritical(secondsLeft: number): boolean {
  return secondsLeft < 300; // 5 minutes
}

/**
 * Check if time is running out (less than 1 minute)
 */
export function isTimeRunningOut(secondsLeft: number): boolean {
  return secondsLeft < 60;
}

/**
 * Debounce function to limit API calls
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  
  return function debounced(...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

/**
 * Throttle function for frequent events
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return function throttled(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Prevent right-click context menu
 */
export function disableContextMenu(element: Document | HTMLElement = document): void {
  element.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    return false;
  }, false);
}

/**
 * Disable text selection
 */
export function disableTextSelection(element: HTMLElement = document.body): void {
  element.style.userSelect = 'none';
  element.style.webkitUserSelect = 'none';
  (element as any).style.msUserSelect = 'none';
  (element as any).style.MozUserSelect = 'none';
  
  element.addEventListener('selectstart', (e) => e.preventDefault(), false);
  element.addEventListener('contextmenu', (e) => e.preventDefault(), false);
}

/**
 * Disable keyboard shortcuts (Ctrl+C, Ctrl+V, etc.)
 */
export function disableKeyboardShortcuts(element: Document | HTMLElement = document): void {
  const disabledKeys = [
    { keyCode: 67, ctrlKey: true }, // Ctrl+C
    { keyCode: 86, ctrlKey: true }, // Ctrl+V
    { keyCode: 88, ctrlKey: true }, // Ctrl+X
    { keyCode: 90, ctrlKey: true }, // Ctrl+Z
    { keyCode: 65, ctrlKey: true }, // Ctrl+A
    { keyCode: 117 }, // F6
    { keyCode: 118 }, // F7
    { keyCode: 119 }, // F8
    { keyCode: 120 }, // F9
    { keyCode: 121 }, // F10
    { keyCode: 122 }, // F11
    { keyCode: 123 }, // F12
  ];

  element.addEventListener('keydown', (e: any) => {
    for (let key of disabledKeys) {
      if (
        e.keyCode === key.keyCode &&
        (key.ctrlKey === undefined || e.ctrlKey === key.ctrlKey)
      ) {
        e.preventDefault();
        return false;
      }
    }
  }, false);
}

/**
 * Prevent page navigation (beforeunload)
 */
export function preventPageNavigation(message: string = "Are you sure you want to leave? Your answers will be lost."): void {
  const handler = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    e.returnValue = message;
    return message;
  };

  window.addEventListener('beforeunload', handler);
  
  // Cleanup function
  window.preventPageNavigationCleanup = () => {
    window.removeEventListener('beforeunload', handler);
  };
}

/**
 * Cleanup page navigation prevention
 */
export function cleanupPageNavigationPrevention(): void {
  if ((window as any).preventPageNavigationCleanup) {
    (window as any).preventPageNavigationCleanup();
  }
}
