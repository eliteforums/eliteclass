// Quick Reference: EduOS Exam Security Features
// ==============================================

// 1. BROWSER FINGERPRINTING & DEVICE TRACKING
// ============================================

import { generateBrowserFingerprint, getOrCreateDeviceId } from '@/modules/exams/utils/exam-security';

// Get unique browser identifier
const fingerprint = generateBrowserFingerprint();
// Returns: "eyJzY3JlZW5SZXNvbHV0aW9uIjoiMTkyMHgxMDgwIi..."

// Get persistent device ID (stored in localStorage)
const deviceId = getOrCreateDeviceId();
// Returns: "device_1234567890_abcd1234" (same across sessions)


// 2. FULLSCREEN CONTROL
// =====================

import { useFullscreenGuard } from '@/modules/exams/hooks/useFullscreenGuard';

function ExamComponent() {
  const fullscreenGuard = useFullscreenGuard({
    enabled: true,
    onViolation: (count, shouldAutoSubmit) => {
      console.log(`Fullscreen exit #${count}`);
      if (shouldAutoSubmit) {
        console.log('Auto-submitting due to excessive fullscreen exits');
      }
    },
    maxViolations: 3, // Auto-submit on 3rd exit
  });

  return (
    <div>
      <p>Fullscreen active: {fullscreenGuard.isFullscreen}</p>
      <p>Violations: {fullscreenGuard.violationCount}</p>
      <button onClick={() => fullscreenGuard.requestFullscreen()}>
        Enter Fullscreen
      </button>
    </div>
  );
}


// 3. TAB SWITCH DETECTION
// =======================

import { useTabSwitchDetection } from '@/modules/exams/hooks/useTabSwitchDetection';

function ExamComponent() {
  const tabDetection = useTabSwitchDetection({
    enabled: true,
    onViolation: (violationType) => {
      // violationType can be: 'tab_switch', 'window_blur', 'alt_tab_attempt', 'cmd_tab_attempt'
      console.log(`Violation: ${violationType}`);
      // Send to backend for logging
      recordViolationWithCheck(attemptId, violationType);
    },
    onVisibilityChange: (isHidden) => {
      console.log(`Page visible: ${!isHidden}`);
    },
  });

  return <div>Page hidden: {tabDetection.isPageHidden}</div>;
}


// 4. REALTIME TIMER SYNC
// ======================

import { useRealtimeExamTimer } from '@/modules/exams/hooks/useRealtimeExamTimer';

function ExamComponent() {
  const timer = useRealtimeExamTimer({
    examId: 'exam-123',
    attemptId: 'attempt-456',
    durationMs: 60 * 60 * 1000, // 60 minutes
    enabled: true,
    onTimeUpdate: (secondsRemaining) => {
      setTimeDisplay(`${Math.floor(secondsRemaining / 60)}:${secondsRemaining % 60}`);
    },
    onTimeExpired: () => {
      submitExam();
    },
    onSyncError: (error) => {
      console.error('Timer sync error:', error);
    },
  });

  return (
    <div>
      <p>Time synced: {timer.isSynced}</p>
      <p>Time remaining: {timer.timeRemaining}s</p>
      <p>Exam expired: {timer.isExpired}</p>
      <button onClick={() => timer.resyncTimer()}>Resync</button>
    </div>
  );
}


// 5. ATTEMPT VALIDATION
// =====================

import { useAttemptValidation } from '@/modules/exams/hooks/useAttemptValidation';

function ExamComponent() {
  const validation = useAttemptValidation({
    examId: 'exam-123',
    userId: 'user-456',
    enabled: true,
  });

  if (validation.isLoading) return <div>Validating...</div>;
  if (!validation.canAttempt) {
    return <div>Error: {validation.reason}</div>;
  }

  return <div>Attempt valid! Can proceed with exam.</div>;
}


// 6. SECURE EXAM WRAPPER
// ======================

import { SecureExamWrapper } from '@/modules/exams/components/SecureExamWrapper';

function ExamPage() {
  return (
    <SecureExamWrapper
      examId="exam-123"
      attemptId="attempt-456"
      enabled={true} // Can disable for admin preview
    >
      {/* Your exam player component here */}
      <ExamPlayer examId="exam-123" />
    </SecureExamWrapper>
  );
}
// Provides:
// - Fullscreen enforcement
// - Tab switch detection
// - Keyboard shortcut blocking
// - Right-click prevention
// - Violation modal


// 7. BACKEND SERVICE FUNCTIONS
// ============================

import {
  validateExamTiming,
  validateSingleAttempt,
  createExamSession,
  recordViolationWithCheck,
  lockExamAttempt,
} from '@/modules/exams/services/exam.service';

// Check if exam is available (server-side timing)
const timing = await validateExamTiming(examId);
if (!timing.success) {
  console.error(timing.error);
} else {
  console.log(`Exam available: ${timing.data.isAvailable}`);
  console.log(`Reason: ${timing.data.reason}`);
  console.log(`Server time: ${timing.data.currentServerTime}`);
}

// Validate single attempt
const singleAttempt = await validateSingleAttempt(examId, userId);
if (singleAttempt.data.canAttempt) {
  console.log('OK to attempt exam');
} else {
  console.log(`Cannot attempt: ${singleAttempt.data.reason}`);
}

// Create secure session
const session = await createExamSession(
  attemptId,
  studentId,
  examId,
  instituteId,
  {
    browserFingerprint: generateBrowserFingerprint(),
    deviceId: getOrCreateDeviceId(),
    userAgent: navigator.userAgent,
  }
);
if (session.success) {
  const { sessionToken } = session.data;
  // Store sessionToken for future requests
}

// Record violation with auto-submit check
const violation = await recordViolationWithCheck(
  attemptId,
  'tab_switch',
  { timestamp: new Date().toISOString() }
);
console.log(`Violations: ${violation.data.totalViolations}`);
if (violation.data.shouldAutoSubmit) {
  console.log('Auto-submitting due to violations');
  // Handle auto-submit
}

// Lock attempt (prevent modifications)
await lockExamAttempt(attemptId);
// After this, all update operations will fail


// 8. SECURITY UTILITIES
// =====================

import {
  disableContextMenu,
  disableTextSelection,
  disableKeyboardShortcuts,
  preventPageNavigation,
  cleanupPageNavigationPrevention,
} from '@/modules/exams/utils/exam-security';

// Disable right-click
disableContextMenu(document);

// Disable text selection
disableTextSelection(document.body);

// Disable keyboard shortcuts (Ctrl+C, F12, etc.)
disableKeyboardShortcuts(document);

// Prevent page navigation with warning
preventPageNavigation('Are you sure? Your exam will be auto-submitted.');

// Cleanup before unmounting
useEffect(() => {
  return () => {
    cleanupPageNavigationPrevention();
  };
}, []);


// 9. COMPLETE EXAM INTEGRATION EXAMPLE
// =====================================

import { useState, useEffect } from 'react';
import { ExamPlayer } from '@/modules/exams/components/student/ExamPlayer';
import { SecureExamWrapper } from '@/modules/exams/components/SecureExamWrapper';
import { useRealtimeExamTimer } from '@/modules/exams/hooks/useRealtimeExamTimer';
import { useFullscreenGuard } from '@/modules/exams/hooks/useFullscreenGuard';
import { useTabSwitchDetection } from '@/modules/exams/hooks/useTabSwitchDetection';
import { useAttemptValidation } from '@/modules/exams/hooks/useAttemptValidation';

export function SecureExamPage({ examId }) {
  const { user } = useAuth();
  const [attempt, setAttempt] = useState(null);

  // All security hooks integrated
  const validation = useAttemptValidation({
    examId,
    userId: user?.id,
    enabled: true,
  });

  const fullscreen = useFullscreenGuard({
    enabled: !!attempt,
    onViolation: (count, shouldAutoSubmit) => {
      if (shouldAutoSubmit) submitExam();
    },
  });

  const tabDetection = useTabSwitchDetection({
    enabled: !!attempt,
    onViolation: (type) => {
      recordViolationWithCheck(attempt.id, type);
    },
  });

  const timer = useRealtimeExamTimer({
    examId,
    attemptId: attempt?.id,
    durationMs: 60 * 60 * 1000,
    enabled: !!attempt,
    onTimeExpired: submitExam,
  });

  if (!validation.canAttempt) return <div>{validation.reason}</div>;

  return (
    <SecureExamWrapper examId={examId} attemptId={attempt?.id}>
      <ExamPlayer examId={examId} />
    </SecureExamWrapper>
  );
}

// NO MANUAL SETUP NEEDED - All security is integrated in:
// - ExamPlayer component
// - SecureExamWrapper component
// - Database migrations


// 10. DATABASE FUNCTIONS (SQL-level)
// ===================================

-- Validate exam timing
SELECT * FROM validate_exam_timing('exam-uuid');

-- Get active attempt
SELECT * FROM get_active_student_attempt('exam-uuid', 'student-uuid');

-- Check active sessions
SELECT count_active_sessions_for_attempt('attempt-uuid');

-- Validate session token
SELECT * FROM validate_session_token('session-token');

-- Record violation with auto-submit
SELECT * FROM record_and_check_violations(
  'attempt-uuid',
  'tab_switch',
  '{"timestamp": "2024-05-22T10:30:00Z"}'::jsonb
);

-- Lock attempt
SELECT lock_exam_attempt('attempt-uuid');

-- Auto-submit expired
SELECT * FROM auto_submit_expired_attempts();


// TESTING SECURITY FEATURES
// ==========================

// Test 1: Try to tab switch
// Expected: Violation recorded, warning shown, count incremented

// Test 2: Exit fullscreen 3 times
// Expected: Auto-submit on 3rd exit

// Test 3: Wait for timer to expire
// Expected: Auto-submit when time reaches 0

// Test 4: Try to access from another device
// Expected: Session token validation fails, access denied

// Test 5: Try to restart exam after submission
// Expected: Error: "Already submitted, multiple attempts not allowed"

// Test 6: Try to submit twice simultaneously
// Expected: First succeeds, second fails with lock error

// Test 7: Network disconnect then reconnect
// Expected: Session re-validated, answers restored, timer synced

// Test 8: Try Ctrl+C or right-click
// Expected: Action prevented, no effect


// MONITORING & ANALYTICS
// ======================

-- Get all violations for an exam
SELECT * FROM test_violations 
WHERE attempt_id IN (SELECT id FROM exam_attempts WHERE exam_id = 'exam-uuid');

-- Get students with excessive violations
SELECT ea.student_id, COUNT(*) as violation_count
FROM test_violations tv
JOIN exam_attempts ea ON tv.attempt_id = ea.id
WHERE ea.exam_id = 'exam-uuid'
GROUP BY ea.student_id
HAVING COUNT(*) > 2;

-- Get auto-submitted exams
SELECT * FROM exam_attempts
WHERE exam_id = 'exam-uuid' AND status = 'auto_submitted';

-- Get locked attempts
SELECT * FROM exam_attempts
WHERE is_locked = TRUE AND exam_id = 'exam-uuid';
