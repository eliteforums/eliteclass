export interface ParentCredentials {
  temporaryPassword: string;
  firstName: string;
}

function sanitizeFirstName(name: string): string {
  const firstToken = name.trim().split(/\s+/)[0] ?? "Parent";
  const onlyLetters = firstToken.replace(/[^a-zA-Z]/g, "") || "Parent";
  return onlyLetters.charAt(0).toUpperCase() + onlyLetters.slice(1).toLowerCase();
}

function secureFourDigits(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  const value = 1000 + (bytes[0] % 9000);
  return String(value);
}

export function generateParentCredentials(parentName: string): ParentCredentials {
  const firstName = sanitizeFirstName(parentName);
  return {
    firstName,
    temporaryPassword: `${firstName}@${secureFourDigits()}`,
  };
}
