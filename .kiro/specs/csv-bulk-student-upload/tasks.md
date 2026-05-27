# Implementation Plan: CSV Bulk Student Upload

## Overview

Implement CSV bulk student upload using the existing BulkImportModal infrastructure. The main new code is: a bulk upload service with validation logic, a force-password-change redirect guard, and updates to the existing modal/parser to support the simplified 3-column CSV format.

## Tasks

- [x] 1. Create bulk upload service with CSV validation
  - [x] 1.1 Create `src/services/bulk-upload.service.ts` with header validation, row validation, and `bulkCreateStudents` function
    - Define `CSVStudentRow`, `BulkUploadValidationResult`, `BulkUploadProgress`, `BulkUploadResult` interfaces
    - Implement `validateCSVHeaders(headers: string[])` — checks for "Full Name", "Mail ID", "Phone No"
    - Implement `validateCSVRow(row)` — validates email format, non-empty phone (6-15 digits), non-empty name
    - Implement `validateCSVData(rows)` — partitions rows into valid/invalid with row numbers
    - Implement `bulkCreateStudents(rows, instituteId, onProgress)` — calls `supabaseAdmin.auth.admin.createUser()` per row with phone as password, `force_password_change: true` in metadata, creates user profile record, handles duplicates by skipping, reports progress
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ]* 1.2 Write property tests for CSV validation logic
    - **Property 1: Row validation preserves valid rows**
    - **Property 2: Invalid rows are always rejected with row numbers**
    - **Property 3: Summary counts are consistent**
    - **Validates: Requirements 1.2, 1.3, 1.4, 2.6**

- [x] 2. Update CSV parser and BulkImportModal for simplified format
  - [x] 2.1 Update `useCSVParser` to map "Full Name" → fullName, "Mail ID" → email, "Phone No" → phone headers
    - Add header mapping for the simplified 3-column format alongside existing format support
    - _Requirements: 1.1_

  - [x] 2.2 Update `BulkImportModal` to use the new bulk upload service
    - Add a CSV upload mode that uses `validateCSVData` and `bulkCreateStudents` from the new service
    - Show validation errors per-row before import starts
    - Show progress indicator during import (processed/total)
    - Show final summary with created/skipped/failed counts
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 2.3 Update `TemplateDownloader` to generate simplified CSV template
    - Template with headers: "Full Name,Mail ID,Phone No" and one example row
    - _Requirements: 6.1, 6.2_

- [x] 3. Checkpoint - Ensure bulk upload flow works
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement force password change guard
  - [x] 4.1 Create `src/components/ForcePasswordChangeGuard.tsx`
    - Read user metadata from auth store (or Supabase session)
    - If `force_password_change === true`, redirect to `/auth/update-password`
    - Wrap this guard around authenticated route layouts (e.g., in the root layout or ProtectedRoute)
    - _Requirements: 4.1, 4.2_

  - [x] 4.2 Update `/auth/update-password` page to handle force-change flow
    - Add validation: new password must be ≥ 8 characters
    - Add validation: new password must differ from temporary password (phone number stored in metadata or passed via state)
    - After successful update, clear `force_password_change` from user_metadata via `supabase.auth.updateUser()`
    - Redirect to dashboard after successful password change
    - _Requirements: 4.3, 4.4, 4.5_

  - [ ]* 4.3 Write property tests for password change guard and validation
    - **Property 5: Force password change redirect is enforced**
    - **Property 6: New password must differ from temporary password**
    - **Validates: Requirements 4.1, 4.2, 4.4**

- [x] 5. Verify forgot password flow
  - [x] 5.1 Ensure forgot password link exists on login page pointing to `/auth/forgot-password`
    - Verify `requestPasswordReset()` in auth.service.ts sends reset email
    - Verify the reset flow clears `force_password_change` flag when new password is set
    - Verify generic message is shown regardless of whether email exists
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 6. Final checkpoint - Ensure end-to-end flow works
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: Admin uploads CSV → students created → student logs in with phone → forced to change password → can access platform

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The project uses TypeScript with TanStack Start (React) and Supabase
- `papaparse` is already installed for CSV parsing
- `supabaseAdmin` is already configured for server-side admin operations
- The existing `signIn()` already returns `passwordChangeRequired` from user_metadata
- The existing `/auth/update-password` route handles password updates — needs enhancement for validation
- Property tests use `fast-check` library for TypeScript
