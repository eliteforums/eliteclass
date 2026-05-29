export interface ProfileCompletenessResult {
  isComplete: boolean;
  missingFields: string[];
}

export function checkProfileCompleteness(
  emergencyContact: { name?: string; phone?: string; relation?: string } | null,
  parentName: string | null | undefined,
  parentPhone: string | null | undefined,
  parentEmail: string | null | undefined,
): ProfileCompletenessResult {
  const missingFields: string[] = [];
  
  if (!parentName?.trim()) missingFields.push("parent_name");
  if (!parentPhone?.trim()) missingFields.push("parent_phone");
  if (!parentEmail?.trim()) missingFields.push("parent_email");
  if (!emergencyContact?.name?.trim()) missingFields.push("emergency_contact_name");
  if (!emergencyContact?.phone?.trim()) missingFields.push("emergency_contact_phone");
  if (!emergencyContact?.relation?.trim()) missingFields.push("emergency_contact_relation");

  return { isComplete: missingFields.length === 0, missingFields };
}
