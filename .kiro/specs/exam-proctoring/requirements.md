# Requirements Document

## Introduction

This feature adds configurable proctoring capabilities to the EliteClass MCQ exam system. Proctoring includes tab-switch detection logging, camera/microphone activation as a visual deterrent, and a fake proctoring UI overlay. The system already has basic security measures (fullscreen enforcement, tab-switch violation counting); this feature extends it with configurable per-exam proctoring settings controlled by admins and teachers, and a client-side deterrent UI that simulates recording without actually storing any audio/video server-side.

## Glossary

- **Proctoring_System**: The client-side subsystem responsible for managing camera/microphone access, displaying the deterrent UI, and coordinating with the tab-switch detection module during an exam attempt.
- **Exam_Form**: The admin/teacher-facing form used to create and configure exam settings, including proctoring options.
- **Exam_Player**: The student-facing exam attempt interface where questions are displayed and answers are submitted.
- **Tab_Switch_Detector**: The module that monitors browser visibility changes and document focus events to detect when a student navigates away from the exam page.
- **Deterrent_UI**: The client-side visual overlay shown to students during a proctored exam, displaying a camera feed preview and recording indicators to simulate active proctoring.
- **Proctoring_Settings**: The set of configurable boolean flags stored per exam that control which proctoring features are active (tab switch detection, camera/mic requirement, deterrent UI).
- **Admin**: A user with administrative privileges who can create and configure exams at the institute level.
- **Teacher**: A user who creates and manages exams for their assigned courses.
- **Student**: A user who attempts exams and is subject to proctoring controls.

## Requirements

### Requirement 1: Proctoring Settings Configuration

**User Story:** As an Admin or Teacher, I want to configure proctoring settings per exam, so that I can control which security measures are active for each test.

#### Acceptance Criteria

1. WHEN an Admin or Teacher creates or edits an exam, THE Exam_Form SHALL display a "Proctoring Settings" section with toggle controls for tab switch detection, camera/microphone requirement, and deterrent UI.
2. THE Exam_Form SHALL store the proctoring settings as part of the exam record in the database with fields: `enable_tab_detection` (boolean), `enable_camera_mic` (boolean), and `enable_deterrent_ui` (boolean).
3. THE Exam_Form SHALL default all proctoring settings to disabled (false) for new exams.
4. WHEN an Admin or Teacher saves an exam with proctoring settings, THE Proctoring_System SHALL persist the settings and apply them to all future attempts of that exam.
5. WHILE an exam has status "published", THE Exam_Form SHALL allow modification of proctoring settings without requiring the exam to be unpublished first.

### Requirement 2: Tab Switch Detection and Logging

**User Story:** As an Admin or Teacher, I want tab switches to be detected and logged during proctored exams, so that I can review student behavior after the exam.

#### Acceptance Criteria

1. WHILE `enable_tab_detection` is true for an exam, THE Tab_Switch_Detector SHALL monitor browser visibility changes and document focus loss events during the exam attempt.
2. WHEN a tab switch or window focus loss is detected, THE Tab_Switch_Detector SHALL record the event with a timestamp, violation type, and attempt identifier in the database.
3. WHILE `enable_tab_detection` is false for an exam, THE Tab_Switch_Detector SHALL not monitor or record tab switch events.
4. WHEN a tab switch is detected and `enable_tab_detection` is true, THE Proctoring_System SHALL display a warning notification to the student indicating the violation was recorded.
5. THE Tab_Switch_Detector SHALL integrate with the existing violation counting mechanism in the SecureExamWrapper, incrementing the violation count per recorded tab switch.
6. IF the browser does not support the Page Visibility API, THEN THE Tab_Switch_Detector SHALL fall back to monitoring document focus and blur events.

### Requirement 3: Camera and Microphone Activation

**User Story:** As an Admin or Teacher, I want the student's camera and microphone to be activated during proctored exams, so that it serves as a deterrent against cheating.

#### Acceptance Criteria

1. WHEN a student starts an exam attempt where `enable_camera_mic` is true, THE Proctoring_System SHALL request browser permissions for camera and microphone access using the MediaDevices API.
2. WHEN the student grants camera and microphone permissions, THE Proctoring_System SHALL activate the media streams and maintain them for the duration of the exam attempt.
3. WHEN the student denies camera or microphone permissions, THE Proctoring_System SHALL display a blocking overlay informing the student that camera and microphone access is required to proceed with the exam.
4. WHILE camera and microphone streams are active, THE Proctoring_System SHALL not transmit, record, or store any audio or video data to any server or persistent storage.
5. WHEN the exam attempt ends (submission or auto-submission), THE Proctoring_System SHALL immediately stop all media stream tracks and release camera and microphone resources.
6. IF the device does not have a camera or microphone available, THEN THE Proctoring_System SHALL display an informational message stating that the required hardware is not detected and prevent the exam from starting.

### Requirement 4: Fake Proctoring Deterrent UI

**User Story:** As an Admin or Teacher, I want students to see a visual indicator that they are being proctored, so that it discourages cheating behavior.

#### Acceptance Criteria

1. WHILE `enable_deterrent_ui` is true and the exam attempt is in progress, THE Deterrent_UI SHALL display a small camera feed preview (picture-in-picture style) in a corner of the Exam_Player interface.
2. WHILE `enable_deterrent_ui` is true and the exam attempt is in progress, THE Deterrent_UI SHALL display a pulsing red recording indicator dot with the text "Proctoring Active".
3. THE Deterrent_UI SHALL be positioned so it does not obstruct the exam questions, answer options, or navigation controls.
4. WHILE `enable_deterrent_ui` is false, THE Deterrent_UI SHALL not render any proctoring visual indicators.
5. THE Deterrent_UI SHALL display the camera feed preview only when `enable_camera_mic` is also true and the camera stream is active.
6. WHEN `enable_deterrent_ui` is true but `enable_camera_mic` is false, THE Deterrent_UI SHALL display only the recording indicator without the camera feed preview.

### Requirement 5: Proctoring Status Visibility for Admin/Teacher

**User Story:** As an Admin or Teacher, I want to see which proctoring features are enabled for each exam, so that I can quickly verify the security configuration.

#### Acceptance Criteria

1. WHEN viewing the exam list or exam detail page, THE Exam_Form SHALL display visual badges or icons indicating which proctoring features are active for each exam.
2. WHEN viewing exam attempt results, THE Proctoring_System SHALL display the tab switch violation log with timestamps for each recorded event.
3. THE Proctoring_System SHALL display the total violation count per student attempt in the results and analytics view.

### Requirement 6: Proctoring Lifecycle Management

**User Story:** As a Student, I want the proctoring system to handle edge cases gracefully, so that technical issues do not unfairly disrupt my exam.

#### Acceptance Criteria

1. IF the camera or microphone stream is interrupted during an exam (device disconnected, browser revokes permission), THEN THE Proctoring_System SHALL display a warning to the student and attempt to re-acquire the media stream.
2. IF the media stream cannot be re-acquired after the interruption, THEN THE Proctoring_System SHALL log the event as a proctoring interruption and allow the student to continue the exam without the camera feed.
3. WHEN a student resumes an exam attempt (page refresh or reconnection), THE Proctoring_System SHALL re-initialize the proctoring features based on the exam's proctoring settings.
4. THE Proctoring_System SHALL not count media stream interruptions caused by hardware failures as tab-switch violations.
