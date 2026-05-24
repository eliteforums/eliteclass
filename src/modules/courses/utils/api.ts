// ---------------------------------------------------------------------------
// EduOS — LMS API helpers
// Unwrap ApiResponse<T> for React Query mutations (throw on failure).
// ---------------------------------------------------------------------------

import type { ApiResponse } from "@/types";

export function unwrapApiResponse<T>(response: ApiResponse<T>, fallbackMessage: string): T {
  if (!response.success || response.data === null) {
    throw new Error(response.error ?? fallbackMessage);
  }
  return response.data;
}
