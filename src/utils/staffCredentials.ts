/**
 * EduOS — Staff Credential Utilities
 * 
 * Logic for generating staff passwords and sanitizing names.
 * Pattern: FirstName@XXXX (e.g. Rahul@4821)
 */

export interface StaffCredentials {
  temporaryPassword: string;
  firstName: string;
}

function sanitizeFirstName(name: string): string {
  // Take the first part of the name
  const firstToken = name.trim().split(/\s+/)[0] ?? "Staff";
  // Keep only letters
  const onlyLetters = firstToken.replace(/[^a-zA-Z]/g, "") || "Staff";
  // Proper Case (Rahul)
  return onlyLetters.charAt(0).toUpperCase() + onlyLetters.slice(1).toLowerCase();
}

function secureFourDigits(): string {
  // Use crypto API for secure random number generation
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  // Generate a number between 1000 and 9999
  const value = 1000 + (bytes[0] % 9000);
  return String(value);
}

/**
 * Generate a generic temporary password for staff.
 */
export function generateTempPassword(): string {
  return `Staff@${secureFourDigits()}`;
}

/**
 * Generate a staff-style temporary password.
 * Format: [FirstName]@[4-Random-Digits]
 */
export function generateStaffCredentials(staffName: string): StaffCredentials {
  const firstName = sanitizeFirstName(staffName);
  return {
    firstName,
    temporaryPassword: `${firstName}@${secureFourDigits()}`,
  };
}
