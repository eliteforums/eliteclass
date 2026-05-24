import { z } from "zod";

export const scheduleSlotSchema = z
  .object({
    batch_id: z.string().uuid("Select a batch"),
    section_id: z.string().uuid().optional().or(z.literal("")),
    subject_id: z.string().uuid().optional().or(z.literal("")),
    teacher_id: z.string().uuid().optional().or(z.literal("")),
    room_id: z.string().uuid().optional().or(z.literal("")),
    day_of_week: z.coerce.number().min(0).max(6),
    start_time: z.string().min(1, "Start time is required"),
    end_time: z.string().min(1, "End time is required"),
    type: z.enum(["regular", "exam", "break", "lunch", "event"]),
    title: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine((d) => d.end_time > d.start_time, {
    message: "End time must be after start time",
    path: ["end_time"],
  });

export type ScheduleSlotSchema = z.infer<typeof scheduleSlotSchema>;

export const subjectSchema = z.object({
  name: z.string().min(1, "Subject name is required"),
  code: z.string().optional(),
});

export const roomSchema = z.object({
  room_name: z.string().min(1, "Room name is required"),
  capacity: z.coerce.number().optional(),
  building: z.string().optional(),
  floor: z.string().optional(),
});

export const exceptionSchema = z.object({
  exception_date: z.string().min(1, "Date is required"),
  type: z.enum(["holiday", "cancelled", "rescheduled", "event"]),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  batch_id: z.string().uuid().optional().or(z.literal("")),
});
