import { z } from "zod";

export const staffAssignmentSchema = z.object({
  batch_id: z.string().optional(),
  course_name: z.string().optional(),
  subject_name: z.string().optional(),
});

export const staffAdmissionSchema = z.object({
  fullName: z.string().min(3, "Full name must be at least 3 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(10, "Phone number must be at least 10 digits"),
  designation: z.string().min(2, "Designation is required"),
  department: z.string().min(2, "Department is required"),
  qualification: z.string().min(2, "Qualification is required"),
  joiningDate: z.string().min(1, "Joining date is required"),
  roleName: z.string().min(1, "Role is required"),
  assignments: z.array(staffAssignmentSchema).optional(),
});

export type StaffAdmissionSchema = z.infer<typeof staffAdmissionSchema>;
export type StaffAssignmentSchema = z.infer<typeof staffAssignmentSchema>;
