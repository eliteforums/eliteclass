// ---------------------------------------------------------------------------
// LMS Storage buckets — must match supabase/migrations/011_course_lms_full.sql
// All object paths are prefixed with `{institute_id}/...`
// ---------------------------------------------------------------------------

export const LMS_STORAGE_BUCKETS = {
  videos: "lms-course-videos",
  materials: "lms-course-materials",
  thumbnails: "lms-thumbnails",
  assignment_resources: "assignment-resources",
  assignment_submissions: "assignment-submissions",
} as const;

export type LmsStorageBucket = (typeof LMS_STORAGE_BUCKETS)[keyof typeof LMS_STORAGE_BUCKETS];

/** Default signed-URL TTL for lesson videos (2 hours). */
export const LMS_VIDEO_SIGNED_URL_TTL = 7200;

/** Default signed-URL TTL for materials & submissions (1 hour). */
export const LMS_DEFAULT_SIGNED_URL_TTL = 3600;
