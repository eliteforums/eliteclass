/**
 * useAttemptValidation Hook
 * Validates attempt status and enforces single attempt policy
 */

import { useEffect, useState, useCallback } from 'react';
import {
  validateSingleAttempt,
  validateExamTiming,
  getActiveAttempt,
} from '../services/exam.service';

interface UseAttemptValidationProps {
  examId: string;
  userId: string;
  enabled: boolean;
}

interface AttemptValidationState {
  isValid: boolean;
  canAttempt: boolean;
  isLocked: boolean;
  timingMessage: string;
  reason: string;
  isLoading: boolean;
}

export function useAttemptValidation({
  examId,
  userId,
  enabled,
}: UseAttemptValidationProps) {
  const [validationState, setValidationState] = useState<AttemptValidationState>({
    isValid: false,
    canAttempt: false,
    isLocked: false,
    timingMessage: '',
    reason: '',
    isLoading: true,
  });

  const validate = useCallback(async () => {
    if (!enabled) return;

    setValidationState((prev) => ({ ...prev, isLoading: true }));

    try {
      // Check exam timing
      const timingRes = await validateExamTiming(examId);
      if (!timingRes.success) {
        setValidationState({
          isValid: false,
          canAttempt: false,
          isLocked: false,
          timingMessage: '',
          reason: timingRes.error || 'Failed to validate timing',
          isLoading: false,
        });
        return;
      }

      const timingData = timingRes.data!;

      // If exam not available yet or already ended
      if (!timingData.isAvailable) {
        setValidationState({
          isValid: false,
          canAttempt: false,
          isLocked: false,
          timingMessage: timingData.reason,
          reason: timingData.reason,
          isLoading: false,
        });
        return;
      }

      // Check for single attempt
      const attemptRes = await validateSingleAttempt(examId, userId);
      if (!attemptRes.success) {
        setValidationState({
          isValid: false,
          canAttempt: false,
          isLocked: false,
          timingMessage: '',
          reason: attemptRes.error || 'Failed to validate attempt',
          isLoading: false,
        });
        return;
      }

      const { canAttempt, reason: attemptReason } = attemptRes.data!;

      if (!canAttempt) {
        setValidationState({
          isValid: false,
          canAttempt: false,
          isLocked: false,
          timingMessage: '',
          reason: attemptReason,
          isLoading: false,
        });
        return;
      }

      // Check active attempt
      const activeRes = await getActiveAttempt(examId, userId);
      if (!activeRes.success) {
        setValidationState({
          isValid: false,
          canAttempt: false,
          isLocked: false,
          timingMessage: '',
          reason: 'Failed to check active attempt',
          isLoading: false,
        });
        return;
      }

      const activeAttempt = activeRes.data;

      setValidationState({
        isValid: true,
        canAttempt: true,
        isLocked: activeAttempt ? activeAttempt.isLocked : false,
        timingMessage: '',
        reason: 'OK',
        isLoading: false,
      });
    } catch (error) {
      setValidationState({
        isValid: false,
        canAttempt: false,
        isLocked: false,
        timingMessage: '',
        reason: 'Validation error: ' + String(error),
        isLoading: false,
      });
    }
  }, [examId, userId, enabled]);

  // Validate on mount and periodically
  useEffect(() => {
    if (!enabled) return;

    validate();

    // Re-validate every 30 seconds
    const interval = setInterval(validate, 30000);

    return () => clearInterval(interval);
  }, [enabled, validate]);

  return {
    ...validationState,
    revalidate: validate,
  };
}
