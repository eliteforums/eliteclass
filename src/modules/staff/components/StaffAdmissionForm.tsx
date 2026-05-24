import { useState, useEffect, useMemo, type ReactNode } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, CheckCircle2, User, Briefcase, Plus, Trash2, BookOpen, Layers, Search, X } from "lucide-react";

import { staffAdmissionSchema, type StaffAdmissionSchema } from "@/modules/staff/validations";
import { admitStaff, updateStaff } from "@/services/staff.service";
import { getBatchesByInstitute } from "@/services/batch.service";
import { getCoursesByInstitute } from "@/services/course.service";
import type { AdmitStaffResult, Batch, Course, Staff } from "@/types";
import { StaffCredentialsCard } from "@/modules/staff/components/StaffCredentialsCard";
import { toast } from "sonner";

interface StaffAdmissionFormProps {
  instituteId: string;
  mode?: "create" | "edit";
  staff?: Staff | null;
  onSuccess: () => void;
  onCancel: () => void;
}

const INPUT_CLASS =
  "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none ring-offset-background transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50";

const LABEL_CLASS = "block text-sm font-medium text-foreground mb-1.5";

function SectionHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
  );
}

export function StaffAdmissionForm({ instituteId, mode = "create", staff = null, onSuccess, onCancel }: StaffAdmissionFormProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<AdmitStaffResult | null>(null);
  const [admittedStaffName, setAdmittedStaffName] = useState("");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseSearch, setCourseSearch] = useState("");
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<StaffAdmissionSchema>({
    resolver: zodResolver(staffAdmissionSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      designation: "",
      department: "",
      qualification: "",
      joiningDate: new Date().toISOString().split("T")[0],
      roleName: "Teacher",
      assignments: [{ batch_id: "", course_name: "", subject_name: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "assignments",
  });

  useEffect(() => {
    const nextAssignments = staff?.assignments?.length
      ? staff.assignments.map((assignment) => ({
          batch_id: assignment.batch_id ?? "",
          course_name: assignment.course_name ?? "",
          subject_name: assignment.subject_name ?? "",
        }))
      : [{ batch_id: "", course_name: "", subject_name: "" }];

    reset({
      fullName: staff?.user?.name ?? "",
      email: staff?.user?.email ?? "",
      phone: staff?.user?.phone ?? "",
      designation: staff?.designation ?? "",
      department: staff?.department ?? "",
      qualification: staff?.qualification ?? "",
      joiningDate: staff?.joining_date ?? new Date().toISOString().split("T")[0],
      roleName: staff?.designation ?? "Teacher",
      assignments: nextAssignments,
    });

    setSelectedCourseIds(staff?.assigned_courses?.map((assignment) => assignment.course_id) ?? []);
    setCourseSearch("");
    setSuccessResult(null);
    setAdmittedStaffName("");
  }, [reset, staff]);

  useEffect(() => {
    async function fetchMetadata() {
      setIsLoadingMetadata(true);
      console.log("[StaffAdmissionForm] Fetching metadata for institute:", instituteId);
      const [batchRes, courseRes] = await Promise.all([
        getBatchesByInstitute(instituteId),
        getCoursesByInstitute(instituteId, false), // Fetch all courses, even inactive ones
      ]);
      
      if (batchRes.success) {
        console.log("[StaffAdmissionForm] Batches fetched successfully:", batchRes.data?.items?.length);
        setBatches(batchRes.data?.items ?? []);
      } else {
        console.error("[StaffAdmissionForm] Failed to fetch batches:", batchRes.error);
      }
      
      if (courseRes.success) {
        console.log("[StaffAdmissionForm] Courses fetched successfully:", courseRes.data?.length);
        console.log("[StaffAdmissionForm] Course data sample:", courseRes.data?.slice(0, 2));
        setCourses(courseRes.data ?? []);
      } else {
        console.error("[StaffAdmissionForm] Failed to fetch courses:", courseRes.error);
      }
      setIsLoadingMetadata(false);
    }
    fetchMetadata();
  }, [instituteId]);

  const filteredCourses = useMemo(() => {
    const query = courseSearch.trim().toLowerCase();
    return courses.filter((course) => {
      if (!query) return true;
      return (
        course.name.toLowerCase().includes(query) ||
        course.code.toLowerCase().includes(query) ||
        (course.description ?? "").toLowerCase().includes(query)
      );
    });
  }, [courseSearch, courses]);

  function toggleCourse(courseId: string) {
    const course = courses.find(c => c.id === courseId);
    if (!course) return;

    setSelectedCourseIds((current) => {
      const isRemoving = current.includes(courseId);
      
      if (isRemoving) {
        // If removing, optionally clean up empty assignments for this course
        const currentAssignments = watch("assignments");
        const indexToRemove = currentAssignments.findIndex(a => a.course_name === course.name && !a.batch_id && !a.subject_name);
        if (indexToRemove !== -1) {
          remove(indexToRemove);
        }
        return current.filter((id) => id !== courseId);
      } else {
        // If adding, and no assignment exists for this course, add a row
        const currentAssignments = watch("assignments");
        const alreadyHas = currentAssignments.some(a => a.course_name === course.name);
        
        if (!alreadyHas) {
          // If the first row is empty, use it. Otherwise append.
          if (currentAssignments.length === 1 && !currentAssignments[0].course_name && !currentAssignments[0].batch_id && !currentAssignments[0].subject_name) {
            setValue("assignments.0.course_name", course.name);
          } else {
            append({ batch_id: "", course_name: course.name, subject_name: "" });
          }
        }
        return [...current, courseId];
      }
    });
  }

  // Watch assignments to sync back to checklist if needed, 
  // but we'll prioritize the checklist as the "master" for the dropdowns.
  const selectedCourses = useMemo(() => {
    return courses.filter(c => selectedCourseIds.includes(c.id));
  }, [courses, selectedCourseIds]);

  // Combined list of course names from both formal Courses and Batches
  const availableCourseNames = useMemo(() => {
    const names = new Set<string>();
    courses.forEach(c => names.add(c.name));
    batches.forEach(b => {
      if (b.course_name && b.course_name !== "General") {
        names.add(b.course_name);
      }
    });
    return Array.from(names).sort();
  }, [courses, batches]);

  // Filtered names based on selection (if any)
  const dropdownCourseNames = useMemo(() => {
    let baseNames = (selectedCourses.length > 0)
      ? selectedCourses.map(c => c.name)
      : availableCourseNames;
    
    console.log("[StaffAdmissionForm] Dropdown courses count:", baseNames.length);
    return baseNames.sort();
  }, [selectedCourses, availableCourseNames]);

  async function onSubmit(values: StaffAdmissionSchema) {
    setServerError(null);
    
    // Ensure all courses mentioned in assignments are also in selectedCourseIds
    const assignmentCourseNames = new Set(values.assignments?.map(a => a.course_name).filter(Boolean));
    const finalSelectedCourseIds = [...selectedCourseIds];
    
    assignmentCourseNames.forEach(name => {
      const course = courses.find(c => c.name === name);
      if (course && !finalSelectedCourseIds.includes(course.id)) {
        finalSelectedCourseIds.push(course.id);
      }
    });

    console.log("[StaffAdmissionForm] Submitting form values:", values);
    console.log("[StaffAdmissionForm] Selected Course IDs for relationship:", finalSelectedCourseIds);

    const assignments = values.assignments?.filter((assignment) =>
      assignment.batch_id || assignment.course_name || assignment.subject_name,
    );

    if (mode === "edit" && staff) {
      const result = await updateStaff(staff.id, {
        fullName: values.fullName,
        email: values.email,
        phone: values.phone,
        designation: values.designation,
        department: values.department,
        qualification: values.qualification,
        joining_date: values.joiningDate,
        is_active: staff.is_active !== false,
        assigned_course_ids: finalSelectedCourseIds,
      });

      if (!result.success || !result.data) {
        setServerError(result.error ?? "Failed to update staff. Please try again.");
        toast.error(result.error ?? "Failed to update staff");
        return;
      }

      toast.success("Staff updated successfully");
      onSuccess();
      return;
    }

    const result = await admitStaff({
      institute_id: instituteId,
      name: values.fullName,
      email: values.email,
      phone: values.phone,
      designation: values.designation,
      department: values.department,
      qualification: values.qualification,
      joining_date: values.joiningDate,
      role_name: values.roleName,
      assigned_course_ids: finalSelectedCourseIds,
      assignments,
    });

    if (!result.success || !result.data) {
      setServerError(result.error ?? "Failed to admit staff. Please try again.");
      toast.error(result.error ?? "Failed to admit staff");
      return;
    }

    setAdmittedStaffName(values.fullName);
    setSuccessResult(result.data);
    onSuccess();
    toast.success("Staff admitted successfully");
  }

  if (mode === "create" && successResult) {
    return (
      <div className="flex flex-col items-center gap-6 py-10 px-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
          <CheckCircle2 className="h-9 w-9 text-green-600 dark:text-green-400" />
        </div>
        <div className="max-w-sm space-y-2">
          <h3 className="text-base font-semibold text-foreground">Staff admitted successfully!</h3>
          <p className="text-sm text-muted-foreground">Login credentials generated below.</p>
        </div>
        <StaffCredentialsCard staffName={admittedStaffName} credentials={successResult} />
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => { reset(); setSuccessResult(null); }}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Add Another
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
      {serverError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {serverError}
        </div>
      )}

      {/* 1. Personal Details */}
      <div>
        <SectionHeader icon={<User />} title="Personal Details" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={LABEL_CLASS}>Full Name *</label>
            <input {...register("fullName")} className={INPUT_CLASS} placeholder="e.g. John Doe" />
            {errors.fullName && <p className="mt-1 text-xs text-destructive">{errors.fullName.message}</p>}
          </div>
          <div>
            <label className={LABEL_CLASS}>Email *</label>
            <input {...register("email")} type="email" className={INPUT_CLASS} placeholder="john@example.com" />
            {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div>
            <label className={LABEL_CLASS}>Phone *</label>
            <input {...register("phone")} className={INPUT_CLASS} placeholder="+91 9876543210" />
            {errors.phone && <p className="mt-1 text-xs text-destructive">{errors.phone.message}</p>}
          </div>
        </div>
      </div>

      {/* 2. Professional Details */}
      <div>
        <SectionHeader icon={<Briefcase />} title="Professional Details" />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL_CLASS}>Designation *</label>
            <input {...register("designation")} className={INPUT_CLASS} placeholder="e.g. Senior Teacher" />
            {errors.designation && <p className="mt-1 text-xs text-destructive">{errors.designation.message}</p>}
          </div>
          <div>
            <label className={LABEL_CLASS}>Department *</label>
            <input {...register("department")} className={INPUT_CLASS} placeholder="e.g. Mathematics" />
            {errors.department && <p className="mt-1 text-xs text-destructive">{errors.department.message}</p>}
          </div>
          <div>
            <label className={LABEL_CLASS}>Qualification *</label>
            <input {...register("qualification")} className={INPUT_CLASS} placeholder="e.g. PhD in Mathematics" />
            {errors.qualification && <p className="mt-1 text-xs text-destructive">{errors.qualification.message}</p>}
          </div>
          <div>
            <label className={LABEL_CLASS}>Joining Date *</label>
            <input {...register("joiningDate")} type="date" className={INPUT_CLASS} />
            {errors.joiningDate && <p className="mt-1 text-xs text-destructive">{errors.joiningDate.message}</p>}
          </div>
          <div className="sm:col-span-2">
            <label className={LABEL_CLASS}>System Role *</label>
            <select {...register("roleName")} className={INPUT_CLASS}>
              <option value="Teacher">Teacher</option>
              <option value="Coordinator">Coordinator</option>
              <option value="HOD">HOD</option>
              <option value="Counselor">Counselor</option>
              <option value="Accountant">Accountant</option>
              <option value="Librarian">Librarian</option>
              <option value="HR">HR</option>
              <option value="Lab Assistant">Lab Assistant</option>
            </select>
            {errors.roleName && <p className="mt-1 text-xs text-destructive">{errors.roleName.message}</p>}
          </div>
        </div>
      </div>

      {/* 3. Course Assignments */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-4">
          <SectionHeader icon={<Layers />} title="Assigned Courses" />
          <span className="text-xs font-medium text-muted-foreground">{selectedCourseIds.length} selected</span>
        </div>

        <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={courseSearch}
              onChange={(event) => setCourseSearch(event.target.value)}
              className={`${INPUT_CLASS} pl-9`}
              placeholder="Search courses by name or code"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {selectedCourseIds.map((courseId) => {
              const course = courses.find((item) => item.id === courseId);
              return (
                <button
                  key={courseId}
                  type="button"
                  onClick={() => toggleCourse(courseId)}
                  className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15"
                >
                  <span>{course?.name ?? course?.code ?? "Selected course"}</span>
                  <X className="h-3 w-3" />
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {isLoadingMetadata ? (
              <div className="sm:col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading courses…
              </div>
            ) : filteredCourses.length > 0 ? (
              filteredCourses.map((course) => {
                const checked = selectedCourseIds.includes(course.id);
                return (
                  <label
                    key={course.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                      checked ? "border-primary bg-primary/5" : "border-border bg-background hover:bg-muted/40"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCourse(course.id)}
                      className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{course.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{course.code}</p>
                    </div>
                  </label>
                );
              })
            ) : (
              <div className="sm:col-span-2 rounded-lg border border-dashed border-border px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground mb-3">No courses found for the current search.</p>
                <div className="flex flex-col items-center gap-2">
                  {courseSearch && (
                    <button
                      type="button"
                      onClick={() => setCourseSearch("")}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      Clear search query
                    </button>
                  )}
                  {!courseSearch && (
                    <p className="text-xs text-muted-foreground italic">
                      Check your institute's course list in Course Management.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Assignments */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <SectionHeader icon={<BookOpen />} title="Assigned Courses & Subjects" />
          <button
            type="button"
            onClick={() => append({ batch_id: "", course_name: "", subject_name: "" })}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
          >
            <Plus className="h-3 w-3" />
            Add Assignment
          </button>
        </div>
        
        <div className="space-y-4">
          {fields.map((field, index) => (
            <div key={field.id} className="relative grid gap-4 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-3">
              <div>
                <label className={LABEL_CLASS}>Course</label>
                <select 
                  {...register(`assignments.${index}.course_name`)} 
                  className={INPUT_CLASS}
                  onChange={(e) => {
                    const val = e.target.value;
                    setValue(`assignments.${index}.course_name`, val);
                    if (val) {
                      const course = courses.find(c => c.name === val);
                      if (course && !selectedCourseIds.includes(course.id)) {
                        setSelectedCourseIds(prev => [...prev, course.id]);
                      }
                    }
                  }}
                >
                  <option value="">Select Course</option>
                  {dropdownCourseNames.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                {selectedCourseIds.length === 0 && availableCourseNames.length > 0 && (
                  <p className="mt-1 text-[10px] text-muted-foreground italic">
                    Tip: Select courses in the section above to filter this list.
                  </p>
                )}
              </div>
              <div>
                <label className={LABEL_CLASS}>Batch / Class</label>
                <select {...register(`assignments.${index}.batch_id`)} className={INPUT_CLASS}>
                  <option value="">Select Batch</option>
                  {batches.map(b => <option key={b.id} value={b.id}>{b.name} ({b.academic_year})</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Subject</label>
                <input 
                  {...register(`assignments.${index}.subject_name`)} 
                  className={INPUT_CLASS} 
                  placeholder="e.g. Calculus" 
                />
              </div>
              {fields.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          {fields.length === 0 && (
            <div className="rounded-lg border border-dashed border-border py-8 text-center">
              <p className="text-sm text-muted-foreground">No assignments added yet.</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-6 border-t border-border">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSubmitting ? (mode === "edit" ? "Saving..." : "Admitting...") : mode === "edit" ? "Save Staff Changes" : "Admit Staff Member"}
        </button>
      </div>
    </form>
  );
}
