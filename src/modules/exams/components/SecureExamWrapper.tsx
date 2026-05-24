/**
 * SecureExamWrapper Component
 * Wraps exam player with security controls:
 * - Fullscreen enforcement
 * - Tab switch detection  
 * - Keyboard shortcuts blocking
 * - Page navigation prevention
 * - Violation monitoring
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { AlertTriangle, AlertCircle, Maximize } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import {
  disableContextMenu,
  disableTextSelection,
  disableKeyboardShortcuts,
  preventPageNavigation,
  cleanupPageNavigationPrevention,
} from '../utils/exam-security';
import { useFullscreenGuard } from '../hooks/useFullscreenGuard';
import { useTabSwitchDetection } from '../hooks/useTabSwitchDetection';
import { recordViolationWithCheck, submitExamAttempt } from '../services/exam.service';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface SecureExamWrapperProps {
  attemptId: string;
  initialViolationCount?: number;
  submissionLockRef?: React.MutableRefObject<boolean>;
  children: React.ReactNode;
  enabled?: boolean;
  onAutoSubmit?: () => void;
}

export function SecureExamWrapper({
  attemptId,
  initialViolationCount = 0,
  submissionLockRef,
  children,
  enabled = true,
  onAutoSubmit,
}: SecureExamWrapperProps) {
  const [showViolationModal, setShowViolationModal] = useState(false);
  const [violationMessage, setViolationMessage] = useState('');
  const [violationCount, setViolationCount] = useState(initialViolationCount);
  const [shouldAutoSubmit, setShouldAutoSubmit] = useState(false);
  const [isAutoSubmitting, setIsAutoSubmitting] = useState(false);
  const isAutoSubmittingRef = useRef(false);
  const violationInFlightRef = useRef(false);
  const lastViolationAtRef = useRef(0);

  useEffect(() => {
    setViolationCount(initialViolationCount);
  }, [initialViolationCount]);

  const handleAutoSubmit = useCallback(async (autoSubmitReason: string) => {
    if (isAutoSubmittingRef.current) return;
    isAutoSubmittingRef.current = true;
    setIsAutoSubmitting(true);
    if (submissionLockRef) submissionLockRef.current = true;
    
    try {
      const result = await submitExamAttempt(attemptId, { autoSubmitReason });
      if (result.success) {
        toast.error('Exam auto-submitted due to security violations');
        if (onAutoSubmit) onAutoSubmit();
      } else {
        toast.error(result.error || 'Auto-submit failed');
        if (submissionLockRef) submissionLockRef.current = false;
      }
    } catch (error) {
      console.error('Auto-submit failed:', error);
      if (submissionLockRef) submissionLockRef.current = false;
    } finally {
      setIsAutoSubmitting(false);
    }
  }, [attemptId, onAutoSubmit, submissionLockRef]);

  const shouldIgnoreViolation = useCallback(() => {
    return Boolean(
      submissionLockRef?.current ||
      isAutoSubmittingRef.current ||
      shouldAutoSubmit
    );
  }, [submissionLockRef, shouldAutoSubmit]);

  const handleViolation = useCallback(async (violationType: string) => {
    if (!enabled || shouldIgnoreViolation() || violationInFlightRef.current) return;

    const now = Date.now();
    if (now - lastViolationAtRef.current < 900) return;
    lastViolationAtRef.current = now;
    violationInFlightRef.current = true;

    try {
      const result = await recordViolationWithCheck(attemptId, violationType, {
        source: 'proctoring',
        recordedAt: new Date().toISOString(),
      });

      if (!result.success || !result.data) {
        toast.error(result.error || 'Failed to record violation');
        return;
      }

      setViolationCount(result.data.totalViolations);

      if (result.data.totalViolations >= 3 || result.data.shouldAutoSubmit) {
        setShouldAutoSubmit(true);
        setViolationMessage('Maximum violations reached. Your exam is being auto-submitted.');
        setShowViolationModal(true);
        await handleAutoSubmit(result.data.reason);
        return;
      }

      if (result.data.totalViolations === 1) {
        setViolationMessage(
          violationType === 'fullscreen_exit'
            ? 'Fullscreen mode is required. Please re-enter fullscreen to continue.'
            : violationType === 'tab_switch'
              ? 'Tab switch detected. Please stay on this page.'
              : 'Window focus loss detected. Please stay on this page.'
        );
        setShowViolationModal(true);
      } else {
        setViolationMessage(`Violation ${result.data.totalViolations}/3 recorded (${violationType}). One more will result in auto-submission.`);
        setShowViolationModal(true);
      }
    } finally {
      violationInFlightRef.current = false;
    }
  }, [attemptId, enabled, handleAutoSubmit, shouldIgnoreViolation]);

  // Fullscreen guard
  const fullscreenGuard = useFullscreenGuard({
    enabled: enabled && !shouldAutoSubmit,
    onViolation: handleViolation,
    shouldIgnoreViolation,
  });

  // Tab switch detection
  useTabSwitchDetection({
    enabled: enabled && !shouldAutoSubmit,
    onViolation: handleViolation,
    shouldIgnoreViolation,
  });

  // Setup security measures on mount
  useEffect(() => {
    if (!enabled) return;

    disableContextMenu(document);
    disableTextSelection(document.body);
    disableKeyboardShortcuts(document);
    preventPageNavigation('Are you sure you want to leave? Your exam will be auto-submitted.');

    return () => {
      cleanupPageNavigationPrevention();
    };
  }, [enabled]);

  // Initial fullscreen requirement overlay
  if (enabled && !fullscreenGuard.isFullscreen && violationCount === 0 && !shouldAutoSubmit) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background/95 backdrop-blur-sm flex items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-6">
          <div className="mx-auto size-16 bg-primary/10 rounded-full flex items-center justify-center">
            <Maximize className="size-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Fullscreen Required</h2>
            <p className="text-muted-foreground">
              This exam requires fullscreen mode to ensure a secure testing environment. 
              Please enable fullscreen to begin your test.
            </p>
          </div>
          <Button size="lg" className="w-full" onClick={() => fullscreenGuard.requestFullscreen()}>
            Enable Fullscreen
          </Button>
          <p className="text-xs text-muted-foreground">
            By starting this test, you agree to follow the examination rules and stay in fullscreen mode.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {children}

      {/* Violation Modal */}
      <AlertDialog open={showViolationModal} onOpenChange={setShowViolationModal}>
        <AlertDialogContent className="z-[10000]">
          <AlertDialogTitle className="flex items-center gap-2">
            {shouldAutoSubmit ? (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            ) : (
              <AlertCircle className="h-5 w-5 text-yellow-600" />
            )}
            {shouldAutoSubmit ? 'Exam Auto-Submission' : 'Exam Policy Violation'}
          </AlertDialogTitle>

          <AlertDialogDescription className="space-y-3">
            <p className="font-medium text-foreground">{violationMessage}</p>
            
            <div className="text-sm text-muted-foreground">
              Violations recorded: <span className={cn("font-bold", violationCount >= 2 ? "text-destructive" : "text-foreground")}>
                  {violationCount}/3
              </span>
            </div>

            {shouldAutoSubmit && (
              <div className="text-sm text-destructive font-bold animate-pulse">
                Your exam is being submitted automatically.
              </div>
            )}

            <div className="mt-4 p-3 bg-muted rounded-lg text-sm">
              <p className="font-semibold mb-2">Examination Rules:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Maintain fullscreen mode at all times</li>
                <li>Do not switch tabs, windows, or applications</li>
                <li>Do not minimize the browser window</li>
                <li>Multiple violations result in automatic submission</li>
              </ul>
            </div>
          </AlertDialogDescription>

          <AlertDialogFooter>
            {!shouldAutoSubmit && (
              <Button
                className="w-full sm:w-auto"
                onClick={() => {
                  setShowViolationModal(false);
                  if (!fullscreenGuard.isFullscreen) {
                    fullscreenGuard.requestFullscreen();
                  }
                }}
              >
                I Understand & Return to Test
              </Button>
            )}
            {shouldAutoSubmit && (
              <Button disabled className="w-full sm:w-auto">
                Submitting...
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
