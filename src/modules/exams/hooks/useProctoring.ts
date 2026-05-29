/**
 * useProctoring Hook
 * Manages camera/mic permissions, stream lifecycle, hardware detection,
 * interruption handling with re-acquisition, and tab switch detection coordination.
 *
 * IMPORTANT: No MediaRecorder is instantiated — no audio/video is recorded or transmitted.
 * Camera/mic streams are used solely as a client-side deterrent.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseProctoringOptions {
  enabled: boolean; // master switch - if false, hook does nothing
  enableCameraMic: boolean;
  enableDeterrentUi: boolean;
  enableTabDetection: boolean;
  attemptId: string;
  onViolation?: (type: string, data?: Record<string, unknown>) => void;
}

export interface UseProctoringReturn {
  cameraStream: MediaStream | null;
  isCameraActive: boolean;
  isMicActive: boolean;
  cameraError: string | null;
  isProctoring: boolean;
  showBlockingOverlay: boolean;
  blockingReason: string | null;
  tabSwitchCount: number;
  isHardwareInterruption: boolean;
  requestPermissions: () => Promise<void>;
  stopStreams: () => void;
  retryCamera: () => Promise<void>;
}

const DEFAULT_RETURN: UseProctoringReturn = {
  cameraStream: null,
  isCameraActive: false,
  isMicActive: false,
  cameraError: null,
  isProctoring: false,
  showBlockingOverlay: false,
  blockingReason: null,
  tabSwitchCount: 0,
  isHardwareInterruption: false,
  requestPermissions: async () => {},
  stopStreams: () => {},
  retryCamera: async () => {},
};

const REACQUISITION_DELAY_MS = 2000;

export function useProctoring(options: UseProctoringOptions): UseProctoringReturn {
  const { enabled, enableCameraMic, enableTabDetection, attemptId, onViolation } = options;

  // State
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showBlockingOverlay, setShowBlockingOverlay] = useState(false);
  const [blockingReason, setBlockingReason] = useState<string | null>(null);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [isHardwareInterruption, setIsHardwareInterruption] = useState(false);

  // Refs to avoid stale closures
  const streamRef = useRef<MediaStream | null>(null);
  const isHardwareInterruptionRef = useRef(false);
  const reacquisitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mountedRef = useRef(true);
  const enableTabDetectionRef = useRef(enableTabDetection);
  const onViolationRef = useRef(onViolation);
  const attemptIdRef = useRef(attemptId);

  // Keep refs in sync
  useEffect(() => {
    enableTabDetectionRef.current = enableTabDetection;
  }, [enableTabDetection]);

  useEffect(() => {
    onViolationRef.current = onViolation;
  }, [onViolation]);

  useEffect(() => {
    attemptIdRef.current = attemptId;
  }, [attemptId]);

  // Check if we're in a browser environment with media device support
  const hasMediaSupport = useCallback((): boolean => {
    return (
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices &&
      !!navigator.mediaDevices.getUserMedia &&
      !!navigator.mediaDevices.enumerateDevices
    );
  }, []);

  // Stop all tracks and release stream
  const stopStreams = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      streamRef.current = null;
    }

    if (reacquisitionTimeoutRef.current) {
      clearTimeout(reacquisitionTimeoutRef.current);
      reacquisitionTimeoutRef.current = undefined;
    }

    if (mountedRef.current) {
      setCameraStream(null);
      setIsCameraActive(false);
      setIsMicActive(false);
      setIsHardwareInterruption(false);
      isHardwareInterruptionRef.current = false;
    }
  }, []);

  // Attach track ended listeners for hardware disconnection detection
  const attachTrackListeners = useCallback(
    (stream: MediaStream) => {
      stream.getTracks().forEach((track) => {
        track.onended = () => {
          if (!mountedRef.current) return;

          console.debug('Proctoring: Track ended -', track.kind);
          setIsHardwareInterruption(true);
          isHardwareInterruptionRef.current = true;

          // Update active state based on which track ended
          if (track.kind === 'video') {
            setIsCameraActive(false);
          } else if (track.kind === 'audio') {
            setIsMicActive(false);
          }

          // Attempt re-acquisition after delay
          reacquisitionTimeoutRef.current = setTimeout(async () => {
            if (!mountedRef.current) return;

            try {
              const newStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true,
              });

              if (!mountedRef.current) {
                newStream.getTracks().forEach((t) => t.stop());
                return;
              }

              // Stop old tracks if any remain
              if (streamRef.current) {
                streamRef.current.getTracks().forEach((t) => {
                  t.onended = null;
                  t.stop();
                });
              }

              streamRef.current = newStream;
              setCameraStream(newStream);
              setIsCameraActive(true);
              setIsMicActive(true);
              setIsHardwareInterruption(false);
              isHardwareInterruptionRef.current = false;
              setCameraError(null);

              attachTrackListeners(newStream);
            } catch {
              // Re-acquisition failed — graceful degradation
              if (!mountedRef.current) return;

              console.debug('Proctoring: Re-acquisition failed, continuing without camera');
              setIsHardwareInterruption(false);
              isHardwareInterruptionRef.current = false;
              setCameraError('Camera re-acquisition failed. Continuing without camera.');

              onViolationRef.current?.('proctoring_interruption', {
                timestamp: new Date().toISOString(),
                details: 'Media stream re-acquisition failed after hardware disconnection',
              });
            }
          }, REACQUISITION_DELAY_MS);
        };
      });
    },
    [] // No dependencies needed — uses refs for mutable values
  );

  // Request camera/mic permissions
  const requestPermissions = useCallback(async () => {
    if (!hasMediaSupport()) {
      setCameraError('Media devices not supported in this environment');
      setShowBlockingOverlay(true);
      setBlockingReason('Camera and microphone are not supported in this browser');
      return;
    }

    try {
      // Check for hardware availability
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasCamera = devices.some((d) => d.kind === 'videoinput');
      const hasMic = devices.some((d) => d.kind === 'audioinput');

      if (!hasCamera || !hasMic) {
        setCameraError('No camera or microphone detected');
        setShowBlockingOverlay(true);
        setBlockingReason('No camera or microphone detected');
        return;
      }

      // Request permissions
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      setCameraStream(stream);
      setIsCameraActive(true);
      setIsMicActive(true);
      setCameraError(null);
      setShowBlockingOverlay(false);
      setBlockingReason(null);

      attachTrackListeners(stream);
    } catch (err: unknown) {
      if (!mountedRef.current) return;

      const error = err as DOMException;
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setCameraError('Camera and microphone access denied');
        setShowBlockingOverlay(true);
        setBlockingReason('Camera and microphone access is required');
      } else if (error.name === 'NotFoundError') {
        setCameraError('No camera or microphone detected');
        setShowBlockingOverlay(true);
        setBlockingReason('No camera or microphone detected');
      } else {
        setCameraError(`Failed to access camera/microphone: ${error.message || 'Unknown error'}`);
        setShowBlockingOverlay(true);
        setBlockingReason('Camera and microphone access is required');
      }
    }
  }, [hasMediaSupport, attachTrackListeners]);

  // Retry camera after failure
  const retryCamera = useCallback(async () => {
    setCameraError(null);
    setShowBlockingOverlay(false);
    setBlockingReason(null);
    await requestPermissions();
  }, [requestPermissions]);

  // Initialize camera/mic on mount when enabled
  useEffect(() => {
    if (!enabled || !enableCameraMic) return;

    requestPermissions();

    // Cleanup is handled by the unmount effect below
  }, [enabled, enableCameraMic, requestPermissions]);

  // Tab detection: visibility change and blur listeners
  useEffect(() => {
    if (!enabled || !enableTabDetection) return;
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      if (!enableTabDetectionRef.current) return;
      if (isHardwareInterruptionRef.current) return; // Property 10: don't count during hardware interruption

      if (document.hidden) {
        setTabSwitchCount((prev) => prev + 1);
        onViolationRef.current?.('tab_switch', {
          timestamp: new Date().toISOString(),
        });
      }
    };

    const handleBlur = () => {
      if (!enableTabDetectionRef.current) return;
      if (isHardwareInterruptionRef.current) return; // Property 10: don't count during hardware interruption

      // Only count blur if the document is not hidden (visibility change handles that case)
      if (!document.hidden) {
        setTabSwitchCount((prev) => prev + 1);
        onViolationRef.current?.('tab_switch', {
          timestamp: new Date().toISOString(),
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [enabled, enableTabDetection]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      // Stop all streams on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          track.onended = null;
          track.stop();
        });
        streamRef.current = null;
      }
      if (reacquisitionTimeoutRef.current) {
        clearTimeout(reacquisitionTimeoutRef.current);
      }
    };
  }, []);

  // If not enabled, return defaults
  if (!enabled) {
    return DEFAULT_RETURN;
  }

  return {
    cameraStream,
    isCameraActive,
    isMicActive,
    cameraError,
    isProctoring: enabled,
    showBlockingOverlay,
    blockingReason,
    tabSwitchCount,
    isHardwareInterruption,
    requestPermissions,
    stopStreams,
    retryCamera,
  };
}
