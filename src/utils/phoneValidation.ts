/**
 * Validates Indian phone numbers.
 * Accepts: 10 digits, optionally prefixed with +91 or 0.
 */
export function isValidPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const cleaned = phone.replace(/[\s\-()]/g, "");
  return /^(\+91|0)?[6-9]\d{9}$/.test(cleaned);
}
