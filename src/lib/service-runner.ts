// ---------------------------------------------------------------------------
// Wraps service calls so nothing throws — returns ApiResponse with safe errors.
// ---------------------------------------------------------------------------

import type { ApiResponse } from "@/types";
import { getErrorMessage, isAbortError } from "@/utils/helpers";

export async function runService<T>(
  label: string,
  fn: () => Promise<ApiResponse<T>>,
): Promise<ApiResponse<T>> {
  try {
    return await fn();
  } catch (err) {
    if (isAbortError(err)) {
      return { data: null, error: null, success: false };
    }
    const message = getErrorMessage(err);
    if (import.meta.env.DEV) {
      console.error(`[service:${label}]`, err);
    }
    return { data: null, error: message, success: false };
  }
}
