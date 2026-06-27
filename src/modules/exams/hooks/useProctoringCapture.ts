/**
 * useProctoringCapture
 *
 * Captures webcam photos at regular intervals during an exam and uploads them
 * to Supabase Storage. Ensures the admin can see student faces.
 *
 * Strategy:
 *   1. Take an initial capture as soon as the camera stream becomes active.
 *   2. Take periodic captures every ~5 minutes (with jitter).
 *   3. If a capture fails (stream not ready), retry after a short delay.
 *
 * Screenshots from screen-share are taken once if a screenStream is provided.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { uploadProctoringCapture } from '../services/exam.service';

interface UseProctoringCaptureOptions {
  enabled: boolean;
  attemptId: string;
  studentId: string;
  examId: string;
  instituteId: string;
  /** Live webcam stream from useProctoring — null if camera not enabled */
  cameraStream: MediaStream | null;
  /** Screen-share stream if the user granted getDisplayMedia — null otherwise */
  screenStream: MediaStream | null;
  /** Total exam duration in milliseconds */
  durationMs: number;
  /** Current question index (attached to capture metadata) */
  currentQuestionIdx: number;
  /** Current seconds remaining (attached to capture metadata) */
  timeRemaining: number;
}

/**
 * Draw one JPEG frame from a MediaStream onto a canvas and return a Blob.
 * Does NOT stop the stream — the caller owns the stream lifecycle.
 */
async function captureFrameFromStream(
  stream: MediaStream,
  mirrorHorizontal = false,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!stream || !stream.active || stream.getVideoTracks().length === 0) {
      resolve(null);
      return;
    }

    // Check that the video track is live
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack || videoTrack.readyState !== 'live') {
      resolve(null);
      return;
    }

    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;

    // Safety timeout — give up after 8 seconds
    const timeoutId = setTimeout(() => {
      video.srcObject = null;
      resolve(null);
    }, 8000);

    const onData = () => {
      // Wait one animation frame to ensure the frame is painted
      requestAnimationFrame(() => {
        clearTimeout(timeoutId);

        const w = video.videoWidth || 640;
        const h = video.videoHeight || 480;

        // Ensure we have valid dimensions
        if (w === 0 || h === 0) {
          video.srcObject = null;
          resolve(null);
          return;
        }

        // Cap resolution to reduce upload size
        const maxW = 640;
        const scale = w > maxW ? maxW / w : 1;
        const canvasW = Math.round(w * scale);
        const canvasH = Math.round(h * scale);

        const canvas = document.createElement('canvas');
        canvas.width = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          video.srcObject = null;
          resolve(null);
          return;
        }
        if (mirrorHorizontal) {
          ctx.translate(canvasW, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvasW, canvasH);
        video.srcObject = null; // release reference; do NOT stop tracks
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.75);
      });
    };

    video.onloadeddata = onData;
    video.onerror = () => {
      clearTimeout(timeoutId);
      video.srcObject = null;
      resolve(null);
    };

    video.play().catch(() => {
      clearTimeout(timeoutId);
      video.srcObject = null;
      resolve(null);
    });
  });
}

// Interval between periodic captures (2 minutes with ±20s jitter).
// Tightened from the original 5min ±1min so short exams still get captures.
const CAPTURE_INTERVAL_MS = 2 * 60 * 1000;
const CAPTURE_JITTER_MS = 20 * 1000;

// Maximum retries for a failed capture
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 10_000;

// Delay before first capture (give camera time to warm up).
// Tightened from 15s to 5s so the first capture lands during short exams.
const INITIAL_CAPTURE_DELAY_MS = 5_000;

export function useProctoringCapture({
  enabled,
  attemptId,
  studentId,
  examId,
  instituteId,
  cameraStream,
  screenStream,
  durationMs,
  currentQuestionIdx,
  timeRemaining,
}: UseProctoringCaptureOptions) {
  const [capturedCount, setCapturedCount] = useState(0);

  // Use refs for mutable values accessed inside setTimeout/interval callbacks
  const cameraStreamRef    = useRef(cameraStream);
  const screenStreamRef    = useRef(screenStream);
  const questionIdxRef     = useRef(currentQuestionIdx);
  const timeRemainingRef   = useRef(timeRemaining);
  const captureIndexRef    = useRef(0);
  const mountedRef         = useRef(true);
  const intervalRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialCaptureRef  = useRef(false);
  const initialTimeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { cameraStreamRef.current  = cameraStream;      }, [cameraStream]);
  useEffect(() => { screenStreamRef.current  = screenStream;      }, [screenStream]);
  useEffect(() => { questionIdxRef.current   = currentQuestionIdx; }, [currentQuestionIdx]);
  useEffect(() => { timeRemainingRef.current = timeRemaining;     }, [timeRemaining]);

  const doCapture = useCallback(async (
    captureType: 'webcam' | 'screenshot',
    retryCount = 0,
  ) => {
    if (!mountedRef.current) return;

    const stream = captureType === 'webcam'
      ? cameraStreamRef.current
      : screenStreamRef.current;

    if (!stream || !stream.active) {
      // Retry if stream not ready yet
      if (retryCount < MAX_RETRIES) {
        setTimeout(() => {
          if (mountedRef.current) doCapture(captureType, retryCount + 1);
        }, RETRY_DELAY_MS);
      }
      return;
    }

    try {
      const blob = await captureFrameFromStream(stream, captureType === 'webcam');
      if (!blob || !mountedRef.current) {
        // Retry on failed capture
        if (retryCount < MAX_RETRIES) {
          setTimeout(() => {
            if (mountedRef.current) doCapture(captureType, retryCount + 1);
          }, RETRY_DELAY_MS);
        }
        return;
      }

      const index = captureIndexRef.current++;

      // Fire-and-forget upload — never block the exam UI
      uploadProctoringCapture(
        attemptId, studentId, examId, instituteId,
        captureType, blob, index,
        {
          question_idx:  questionIdxRef.current,
          time_remaining: timeRemainingRef.current,
        },
      )
        .then((res) => {
          if (mountedRef.current && res.success) {
            setCapturedCount((p) => p + 1);
          } else if (!res.success) {
            console.debug('[proctoring-capture] upload failed:', res.error);
          }
        })
        .catch((err) => console.debug('[proctoring-capture] upload error:', err));
    } catch (err) {
      console.debug('[proctoring-capture] capture failed:', err);
      if (retryCount < MAX_RETRIES) {
        setTimeout(() => {
          if (mountedRef.current) doCapture(captureType, retryCount + 1);
        }, RETRY_DELAY_MS);
      }
    }
  }, [attemptId, studentId, examId, instituteId]);

  // Take initial capture once camera stream becomes available
  useEffect(() => {
    if (!enabled || !attemptId || !cameraStream || initialCaptureRef.current) return;

    // Check if stream is active
    if (!cameraStream.active || cameraStream.getVideoTracks().length === 0) return;

    initialCaptureRef.current = true;

    // Small delay to let the camera warm up and produce real frames
    initialTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) {
        doCapture('webcam');
      }
    }, INITIAL_CAPTURE_DELAY_MS);

    return () => {
      if (initialTimeoutRef.current) {
        clearTimeout(initialTimeoutRef.current);
      }
    };
  }, [enabled, attemptId, cameraStream, doCapture]);

  // Schedule periodic captures every ~5 minutes
  useEffect(() => {
    if (!enabled || !attemptId || durationMs <= 0) return;

    // Start periodic captures after initial delay + first interval
    const startDelay = INITIAL_CAPTURE_DELAY_MS + CAPTURE_INTERVAL_MS;

    const timeout = setTimeout(() => {
      if (!mountedRef.current) return;

      // Take one immediately at the first interval mark
      doCapture('webcam');

      // Then set up the recurring interval
      intervalRef.current = setInterval(() => {
        if (!mountedRef.current) return;

        // Add jitter to make timing less predictable
        const jitterDelay = Math.random() * CAPTURE_JITTER_MS;
        setTimeout(() => {
          if (mountedRef.current) doCapture('webcam');
        }, jitterDelay);
      }, CAPTURE_INTERVAL_MS);
    }, startDelay);

    return () => {
      clearTimeout(timeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, attemptId, durationMs, doCapture]);

  // Take one screenshot capture at ~40% of exam duration if screen stream is available
  useEffect(() => {
    if (!enabled || !attemptId || durationMs <= 0 || !screenStream) return;

    const delay = Math.max(30_000, Math.floor(durationMs * 0.4 + (Math.random() - 0.5) * 0.1 * durationMs));
    const timeout = setTimeout(() => {
      if (mountedRef.current) doCapture('screenshot');
    }, delay);

    return () => clearTimeout(timeout);
  }, [enabled, attemptId, durationMs, screenStream, doCapture]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (initialTimeoutRef.current) {
        clearTimeout(initialTimeoutRef.current);
      }
    };
  }, []);

  return { capturedCount };
}
