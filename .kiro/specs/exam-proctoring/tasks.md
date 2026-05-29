# Implementation Plan: Exam Proctoring

## Overview

Add configurable proctoring to the MCQ exam system with tab switch detection, camera/mic activation as deterrent, fake proctoring UI overlay, per-exam settings, and violation logging.

## Tasks

- [x] 1. Add proctoring columns to exams table in `supabase/setup.sql`: `enable_tab_detection BOOLEAN NOT NULL DEFAULT FALSE`, `enable_camera_mic BOOLEAN NOT NULL DEFAULT FALSE`, `enable_deterrent_ui BOOLEAN NOT NULL DEFAULT FALSE`
- [x] 2. Update `src/modules/exams/validations/exam.schema.ts` to add `enable_tab_detection`, `enable_camera_mic`, `enable_deterrent_ui` as `z.boolean().default(false)` fields to `examSchema`
- [x] 3. Create `src/modules/exams/components/admin/ProctoringSettingsCard.tsx` with 3 Switch toggles (Tab Detection, Camera/Mic, Deterrent UI) following the existing Card + FormField + Switch pattern
- [x] 4. Integrate `ProctoringSettingsCard` into `src/modules/exams/components/admin/ExamForm.tsx` in the right column after "Grading & Settings" card, with default values `false` for all proctoring fields
- [x] 5. Create `src/modules/exams/hooks/useProctoring.ts` hook with camera/mic permission request via `getUserMedia`, hardware detection via `enumerateDevices`, stream lifecycle management, interruption handling with re-acquisition, and permission denied blocking state
- [x] 6. Implement stream interruption filtering in `useProctoring` to ensure hardware failures (track ended events) do NOT trigger tab-switch violation recording
- [x] 7. Create `src/modules/exams/components/student/ProctoringOverlay.tsx` with camera preview (160×120px video element, fixed top-right), pulsing red recording indicator with "Proctoring Active" text, and conditional rendering based on feature flags
- [~] 8. In `ExamPlayer.tsx`, read proctoring settings from exam data, initialize `useProctoring` hook, render `ProctoringOverlay`, and render blocking overlay when camera/mic is denied or hardware unavailable
- [~] 9. Pass `enableTabDetection` flag from exam settings to `SecureExamWrapper` to conditionally enable/disable the existing `useTabSwitchDetection` hook
- [~] 10. Wire `useProctoring.stopStreams()` to exam submission paths (manual and auto-submit) and handle exam resume by re-initializing proctoring from stored settings
- [~] 11. Add `getViolationLog(attemptId)` and `recordProctoringEvent(attemptId, eventType, data)` functions to `src/modules/exams/services/exam.service.ts`
- [~] 12. Create `src/modules/exams/components/admin/ViolationLog.tsx` component displaying a table of violations with timestamp, type, and details columns
- [~] 13. Integrate `ViolationLog` into the exam results view and display total violation count badge in `AttemptList` component
- [~] 14. Create `src/modules/exams/components/admin/ProctoringStatusBadges.tsx` with colored badges for each active proctoring feature using lucide-react icons (Eye, Camera, Shield)
- [~] 15. Integrate `ProctoringStatusBadges` into admin exam detail page header and exam list view

## Task Dependency Graph

```json
{
  "waves": [
    {"tasks": ["1"]},
    {"tasks": ["2"]},
    {"tasks": ["3", "5", "11", "14"]},
    {"tasks": ["4", "6", "7", "9", "12", "15"]},
    {"tasks": ["8", "10", "13"]}
  ]
}
```

## Notes

- The existing `exam_violations` table already has the correct schema for proctoring violation records (attempt_id, violation_type, violation_data JSONB, timestamp)
- No new database tables are needed — only 3 new columns on the `exams` table
- Camera/mic streams are client-side only — no server recording infrastructure required
- The `SecureExamWrapper` already has violation handling; proctoring extends it with configurable tab detection
