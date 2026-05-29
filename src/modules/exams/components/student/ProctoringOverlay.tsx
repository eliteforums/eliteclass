import React, { useRef, useEffect } from 'react';

export interface ProctoringOverlayProps {
  cameraStream: MediaStream | null;
  showCameraPreview: boolean; // true when deterrent_ui AND camera_mic AND stream active
  showRecordingIndicator: boolean; // true when deterrent_ui is enabled
}

/**
 * ProctoringOverlay
 *
 * Renders the fake proctoring deterrent UI:
 * - A small camera preview (160×120px) in the top-right corner
 * - A pulsing red recording indicator with "Proctoring Active" text
 *
 * No audio/video is recorded or transmitted. This is purely a visual deterrent.
 */
export function ProctoringOverlay({
  cameraStream,
  showCameraPreview,
  showRecordingIndicator,
}: ProctoringOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Set the video element's srcObject when the stream changes
  useEffect(() => {
    if (videoRef.current) {
      if (cameraStream && showCameraPreview) {
        videoRef.current.srcObject = cameraStream;
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [cameraStream, showCameraPreview]);

  // Render nothing if neither preview nor indicator should be shown
  if (!showCameraPreview && !showRecordingIndicator) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col items-end gap-2 pointer-events-none">
      {/* Camera Preview */}
      {showCameraPreview && (
        <div className="rounded-lg border border-gray-300 overflow-hidden shadow-md bg-black">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="block"
            style={{
              width: '160px',
              height: '120px',
              transform: 'scaleX(-1)',
              objectFit: 'cover',
            }}
          />
        </div>
      )}

      {/* Recording Indicator */}
      {showRecordingIndicator && (
        <div className="flex items-center gap-2 bg-gray-900/80 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-md">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-600" />
          </span>
          <span className="text-xs font-medium text-white select-none">
            Proctoring Active
          </span>
        </div>
      )}
    </div>
  );
}
