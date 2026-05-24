// ---------------------------------------------------------------------------
// Utilities (consolidated merged version)
// ---------------------------------------------------------------------------

/** Format an ISO date string into a short Indian locale date. */
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts.map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return `${str.slice(0, length)}...`;
}

/** Copy text to clipboard using modern API with a DOM fallback. */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fallthrough to legacy approach
    }
  }

  if (typeof document === "undefined") return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }

  document.body.removeChild(textarea);
  return copied;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/** Robust error message normalization (merged logic). */
export function getErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (!error) return fallback;
  if (typeof error === "string") return error;

  // Handle common Error objects
  if (error instanceof Error && error.message) return error.message;

  // Handle FetchError-like shapes where message might be missing
  const errObj = error as Record<string, unknown>;
  if (errObj.name === "FetchError" && (!errObj.message || errObj.message === "undefined")) {
    return "Network error: Failed to connect to the server. Please check your internet connection.";
  }

  // Nested message patterns
  const maybeMessage = errObj.message;
  if (typeof maybeMessage === "string" && maybeMessage.trim()) return maybeMessage;

  const maybeError = errObj.error;
  if (maybeError && typeof maybeError === "object") {
    const nested = (maybeError as Record<string, unknown>).message;
    if (typeof nested === "string" && nested.trim()) return nested;
  }

  const stringified = String(error);
  if (stringified && stringified !== "[object Object]") return stringified;
  return fallback;
}

export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    const msg = String(err || "").toLowerCase();
    return msg.includes("abort") || msg.includes("cancel");
  }
  if (typeof DOMException !== "undefined" && err instanceof DOMException) {
    return (err as DOMException).name === "AbortError";
  }
  const maybe = err as { name?: unknown; code?: unknown };
  return maybe.name === "AbortError" || maybe.code === 20;
}

export function buildQueryString(
  params: Record<string, string | number | boolean | undefined>,
): string {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return qs ? `?${qs}` : "";
}

export function classNames(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

