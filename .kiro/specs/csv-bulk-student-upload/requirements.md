# Requirements Document

## Introduction

This feature enables administrators on the EduOS platform to bulk-upload students via a CSV file. Each row in the CSV creates a Supabase Auth user with email as username and phone number as temporary password. Students are flagged to change their password on first login. A forgot password flow allows students to reset credentials via email.

## Glossary

- **Admin**: An authenticated user with the administrator role who manages students on the platform
- **CSV_File**: A comma-separated values file containing student records with headers: Full Name, Mail ID, Phone No
- **Bulk_Upload_Service**: The server-side service responsible for parsing CSV data and creating student accounts in batch
- **Auth_System**: The Supabase Auth module that handles user creation, login, password reset, and session management
- **Student**: A user account created via the bulk upload process with role "student"
- **Force_Password_Change_Flag**: A boolean (`force_password_change`) stored in user_metadata that indicates the student must change their password before accessing the platform
- **Password_Reset_Email**: An email sent by Supabase Auth containing a secure link for the student to set a new password
- **BulkImportModal**: The existing UI modal component where the admin initiates the CSV upload process

## Requirements

### Requirement 1: CSV File Validation

**User Story:** As an Admin, I want the system to validate my CSV file before processing, so that I receive immediate feedback on formatting errors.

#### Acceptance Criteria

1. WHEN a CSV file is uploaded, THE Bulk_Upload_Service SHALL verify the file contains the required headers: Full Name, Mail ID, Phone No
2. WHEN a CSV file contains rows with missing or empty Mail ID values, THE Bulk_Upload_Service SHALL reject those rows and report the row numbers with errors
3. WHEN a CSV file contains rows with invalid email format in Mail ID, THE Bulk_Upload_Service SHALL reject those rows and report a descriptive validation error per row
4. WHEN a CSV file contains rows with missing or empty Phone No values, THE Bulk_Upload_Service SHALL reject those rows and report the row numbers with errors
5. WHEN a CSV file exceeds 10MB in size, THE Bulk_Upload_Service SHALL reject the file and display an error message indicating the size limit
6. WHEN a CSV file contains zero valid data rows, THE Bulk_Upload_Service SHALL display an error indicating no students can be imported

### Requirement 2: Bulk Student Account Creation

**User Story:** As an Admin, I want each valid CSV row to create a student account with email as username and phone as temporary password, so that students can log in immediately after upload.

#### Acceptance Criteria

1. WHEN a valid CSV row is processed, THE Bulk_Upload_Service SHALL create a Supabase Auth user with email set to the Mail ID value and password set to the Phone No value
2. WHEN a valid CSV row is processed, THE Bulk_Upload_Service SHALL set `force_password_change: true` in the created user's user_metadata
3. WHEN a valid CSV row is processed, THE Bulk_Upload_Service SHALL store the Full Name in the user profile
4. WHEN a valid CSV row is processed, THE Bulk_Upload_Service SHALL store the Phone No in the user's phone field
5. IF a user with the same email already exists, THEN THE Bulk_Upload_Service SHALL skip that row and include it in a list of skipped duplicates reported to the Admin
6. WHEN all rows have been processed, THE Bulk_Upload_Service SHALL display a summary showing total processed, successfully created, skipped, and failed counts

### Requirement 3: Upload Progress and Feedback

**User Story:** As an Admin, I want to see real-time progress during the bulk upload, so that I know how the import is proceeding.

#### Acceptance Criteria

1. WHILE the Bulk_Upload_Service is processing rows, THE BulkImportModal SHALL display a progress indicator showing the number of rows processed out of the total
2. WHEN the upload completes, THE BulkImportModal SHALL display a results summary with counts of created, skipped, and failed records
3. WHEN rows fail during processing, THE BulkImportModal SHALL display the specific error for each failed row including the row number

### Requirement 4: Forced Password Change on First Login

**User Story:** As a Student, I want to be prompted to change my temporary password on first login, so that my account is secured with a password only I know.

#### Acceptance Criteria

1. WHEN a Student logs in and their user_metadata contains `force_password_change: true`, THE Auth_System SHALL redirect the Student to the password change page
2. WHILE the Force_Password_Change_Flag is true, THE Auth_System SHALL prevent the Student from accessing any other platform pages
3. WHEN the Student submits a new password on the password change page, THE Auth_System SHALL update the password and set `force_password_change` to false in user_metadata
4. WHEN the Student submits a new password, THE Auth_System SHALL validate that the new password is different from the temporary password (Phone No)
5. WHEN the Student submits a new password shorter than 8 characters, THE Auth_System SHALL display a validation error and require a longer password

### Requirement 5: Forgot Password

**User Story:** As a Student, I want to reset my password via email, so that I can regain access to my account if I forget my password.

#### Acceptance Criteria

1. WHEN a Student requests a password reset with a valid email, THE Auth_System SHALL send a Password_Reset_Email to that address
2. WHEN the Student clicks the reset link in the Password_Reset_Email, THE Auth_System SHALL present a form to set a new password
3. WHEN the Student submits a new password via the reset form, THE Auth_System SHALL update the password and set `force_password_change` to false in user_metadata
4. IF a password reset is requested for an email that does not exist, THEN THE Auth_System SHALL display a generic confirmation message without revealing whether the email exists

### Requirement 6: CSV Template Download

**User Story:** As an Admin, I want to download a CSV template with the correct headers, so that I can fill in student data in the expected format.

#### Acceptance Criteria

1. THE BulkImportModal SHALL provide a downloadable CSV template file with headers: Full Name, Mail ID, Phone No
2. WHEN the Admin clicks the download template button, THE BulkImportModal SHALL generate and download a CSV file with the correct headers and one example row
