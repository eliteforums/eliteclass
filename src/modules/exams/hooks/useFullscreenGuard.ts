/**
 * useFullscreenGuard Hook
 * Enforces fullscreen mode during exam and detects exits
 * Records violations for auto-submit after excessive exits
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { isFullscreenActive, requestFullscreen, exitFullscreen } from '../utils/exam-security';

interface UseFullscreenGuardProps {
  enabled: boolean;
  onViolation?: (violationType: string) => void;
  shouldIgnoreViolation?: () => boolean;
}

export function useFullscreenGuard({
  enabled,
  onViolation,
  shouldIgnoreViolation,
}: UseFullscreenGuardProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const requestTimeoutRef = useRef<NodeJS.Timeout>();
  const isEnabledRef = useRef(enabled);

  // Keep ref in sync to avoid stale closures in event listeners
  useEffect(() => {
    isEnabledRef.current = enabled;
  }, [enabled]);

  // Handle fullscreen change
  const handleFullscreenChange = useCallback(() => {
    const active = isFullscreenActive();
    setIsFullscreen(active);

    // Only record violation if it was enabled and is now exiting
    if (!active && isEnabledRef.current && !shouldIgnoreViolation?.()) {
      onViolation?.('fullscreen_exit');
    }
  }, [onViolation, shouldIgnoreViolation]);

  // Handle fullscreen error
  const handleFullscreenError = useCallback((e: Event) => {
    console.error('Fullscreen error occurred:', e);
    setIsFullscreen(false);
  }, []);

  // Setup listeners
  useEffect(() => {
    const fullscreenEvents = [
      'fullscreenchange',
      'webkitfullscreenchange',
      'mozfullscreenchange',
      'msfullscreenchange',
    ];

    const errorEvents = [
      'fullscreenerror',
      'webkitfullscreenerror',
      'mozfullscreenerror',
      'msfullscreenerror',
    ];

    fullscreenEvents.forEach((event) => {
      document.addEventListener(event, handleFullscreenChange);
    });

    errorEvents.forEach((event) => {
      document.addEventListener(event, handleFullscreenError);
    });

    // Initial check
    setIsFullscreen(isFullscreenActive());

    return () => {
      fullscreenEvents.forEach((event) => {
        document.removeEventListener(event, handleFullscreenChange);
      });
      errorEvents.forEach((event) => {
        document.removeEventListener(event, handleFullscreenError);
      });
      
      if (requestTimeoutRef.current) clearTimeout(requestTimeoutRef.current);
    };
  }, [handleFullscreenChange, handleFullscreenError]);

  const handleRequestFullscreen = useCallback(async () => {
    await requestFullscreen();
  }, []);

  const handleExitFullscreen = useCallback(async () => {
    await exitFullscreen();
  }, []);

  return {
    isFullscreen,
    requestFullscreen: handleRequestFullscreen,
    exitFullscreen: handleExitFullscreen,
  };
}
