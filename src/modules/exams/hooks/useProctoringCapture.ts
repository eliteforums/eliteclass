/**
 * useProctoringCapture
 *
 * Schedules silent proctoring captures (webcam photos and screen screenshots)
 * at randomised intervals during an exam.  Uploads to Supabase Storage in the
 * background — never blocks the exam UI.
 *
 * Webcam (2 per exam):  captured from the existing MediaStream; completely silent.
 * Screenshot (1 per exam): captured from the screen-share stream if one was granted.
 *
 * Scheduling (for a 60-min exam):
 *   Webcam 1  — random within 20–40 % of total duration  (~12–24 min)
 *   Webcam 2  — random within 55–75 % of total duration  (~33–45 min)
 *   Screenshot — random within 38–58 % of total duration  (~23–35 min)
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
      requestAnimationFrame(() => {
        clearTimeout(timeoutId);
        const w = Math.min(video.videoWidth || 640, 1280);
        const h = Math.min(video.videoHeight || 480, 960);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          video.srcObject = null;
          resolve(null);
          return;
        }
        if (mirrorHorizontal) {
          ctx.translate(w, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, w, h);
        video.srcObject = null; // release reference; do NOT stop tracks
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.80);
      });
    };

    video.onloadeddata = onData;
    video.onerror = () => {
      clearTimeout(timeoutId);
      video.srcObject = null;
      resolve(null);
    };

    video.load();
  });
}

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

  // Use refs for mutable values accessed inside setTimeout callbacks
  const cameraStreamRef    = useRef(cameraStream);
  const screenStreamRef    = useRef(screenStream);
  const questionIdxRef     = useRef(currentQuestionIdx);
  const timeRemainingRef   = useRef(timeRemaining);
  const captureIndexRef    = useRef(0);
  const timeoutsRef        = useRef<ReturnType<typeof setTimeout>[]>([]);
  const mountedRef         = useRef(true);

  useEffect(() => { cameraStreamRef.current  = cameraStream;      }, [cameraStream]);
  useEffect(() => { screenStreamRef.current  = screenStream;      }, [screenStream]);
  useEffect(() => { questionIdxRef.current   = currentQuestionIdx; }, [currentQuestionIdx]);
  useEffect(() => { timeRemainingRef.current = timeRemaining;     }, [timeRemaining]);

  const doCapture = useCallback(async (captureType: 'webcam' | 'screenshot') => {
    if (!mountedRef.current) return;

    const stream = captureType === 'webcam'
      ? cameraStreamRef.current
      : screenStreamRef.current;

    if (!stream) return; // stream not available — skip silently

    try {
      const blob = await captureFrameFromStream(stream, captureType === 'webcam');
      if (!blob || !mountedRef.current) return;

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
        .then(() => { if (mountedRef.current) setCapturedCount((p) => p + 1); })
        .catch((err) => console.debug('[proctoring-capture] upload failed:', err));
    } catch (err) {
      console.debug('[proctoring-capture] capture failed:', err);
    }
  }, [attemptId, studentId, examId, instituteId]);

  // Schedule captures once when the exam attempt is known
  useEffect(() => {
    if (!enabled || !attemptId || durationMs <= 0) return;

    // Clear any previous timeouts (e.g. if hook reinitialises)
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];

    // ±10 % random jitter so captures feel non-mechanical
    const jitter = () => (Math.random() - 0.5) * 0.1 * durationMs;

    const min30s = 30_000; // never fire in first 30 seconds

    // Webcam 1 — 20–40 % of duration
    const w1 = Math.max(min30s, Math.floor(durationMs * 0.30 + jitter()));
    // Webcam 2 — 55–75 % of duration
    const w2 = Math.max(w1 + 30_000, Math.floor(durationMs * 0.65 + jitter()));
    // Screenshot — 38–58 % of duration
    const s1 = Math.max(min30s, Math.floor(durationMs * 0.48 + jitter()));

    timeoutsRef.current.push(setTimeout(() => doCapture('webcam'),     w1));
    timeoutsRef.current.push(setTimeout(() => doCapture('webcam'),     w2));
    timeoutsRef.current.push(setTimeout(() => doCapture('screenshot'), s1));

    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    };
  }, [enabled, attemptId, durationMs, doCapture]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  return { capturedCount };
}
