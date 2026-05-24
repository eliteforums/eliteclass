import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import * as assignmentService from "../services/assignment.service";
import type { CreateAssignmentPayload, AssignmentResourceSchema } from "@/types";

export const assignmentKeys = {
  all: (instituteId: string) => ["assignments", instituteId] as const,
  list: (instituteId: string, filters: any) => [...assignmentKeys.all(instituteId), "list", filters] as const,
  detail: (id: string) => ["assignment", id] as const,
  studentList: (studentId: string) => ["assignments", "student", studentId] as const,
  studentDetail: (id: string, studentId: string) => ["assignment", id, "student", studentId] as const,
  submissions: (assignmentId: string) => ["submissions", assignmentId] as const,
  assignees: (assignmentId: string) => ["assignees", assignmentId] as const,
};

export function useAssignments(filters: any = {}) {
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? "";

  return useQuery({
    queryKey: assignmentKeys.list(instituteId, filters),
    queryFn: () => assignmentService.listAssignments(instituteId, filters),
    enabled: !!instituteId,
  });
}

export function useAssignmentDetail(id: string) {
  return useQuery({
    queryKey: assignmentKeys.detail(id),
    queryFn: () => assignmentService.getAssignmentDetail(id),
    enabled: !!id,
  });
}

export function useCreateAssignment() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? "";

  return useMutation({
    mutationFn: ({ payload, resources }: { payload: CreateAssignmentPayload; resources?: AssignmentResourceSchema[] }) =>
      assignmentService.createAssignment(instituteId, user?.id ?? "", payload, resources),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assignmentKeys.all(instituteId) });
    },
  });
}

export function useUpdateAssignment() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? "";

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateAssignmentPayload> }) =>
      assignmentService.updateAssignment(id, payload),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: assignmentKeys.all(instituteId) });
      queryClient.invalidateQueries({ queryKey: assignmentKeys.detail(id) });
    },
  });
}

export function useDeleteAssignment() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? "";

  return useMutation({
    mutationFn: (id: string) => assignmentService.deleteAssignment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: assignmentKeys.all(instituteId) });
    },
  });
}

export function useAssignToStudents() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? "";

  return useMutation({
    mutationFn: ({ assignmentId, studentIds }: { assignmentId: string; studentIds: string[] }) =>
      assignmentService.assignToStudents(assignmentId, instituteId, studentIds),
    onSuccess: (_, { assignmentId }) => {
      queryClient.invalidateQueries({ queryKey: assignmentKeys.assignees(assignmentId) });
      queryClient.invalidateQueries({ queryKey: assignmentKeys.all(instituteId) });
    },
  });
}

export function useAssignees(assignmentId: string) {
  return useQuery({
    queryKey: assignmentKeys.assignees(assignmentId),
    queryFn: () => assignmentService.getAssignees(assignmentId),
    enabled: !!assignmentId,
  });
}

export function useSubmissions(assignmentId: string) {
  return useQuery({
    queryKey: assignmentKeys.submissions(assignmentId),
    queryFn: () => assignmentService.listSubmissions(assignmentId),
    enabled: !!assignmentId,
  });
}

export function useStudentAssignments() {
  const { user } = useAuthStore();
  const studentId = user?.id ?? "";

  return useQuery({
    queryKey: assignmentKeys.studentList(studentId),
    queryFn: () => assignmentService.getStudentAssignments(studentId),
    enabled: !!studentId,
  });
}

export function useStudentAssignmentDetail(assignmentId: string) {
  const { user } = useAuthStore();
  const studentId = user?.id ?? "";

  return useQuery({
    queryKey: assignmentKeys.studentDetail(assignmentId, studentId),
    queryFn: () => assignmentService.getStudentAssignmentDetail(assignmentId, studentId),
    enabled: !!assignmentId && !!studentId,
  });
}

export function useSubmitAssignment() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const instituteId = user?.institute_id ?? "";

  return useMutation({
    mutationFn: ({ 
      assignmentId, 
      content, 
      files 
    }: { 
      assignmentId: string; 
      content?: string; 
      files?: AssignmentResourceSchema[] 
    }) =>
      assignmentService.submitAssignment(assignmentId, user?.id ?? "", instituteId, content, files),
    onSuccess: (_, { assignmentId }) => {
      queryClient.invalidateQueries({ queryKey: ["assignments", "student", user?.id] });
      queryClient.invalidateQueries({ queryKey: assignmentKeys.studentDetail(assignmentId, user?.id ?? "") });
    },
  });
}

export function useGradeSubmission() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: ({ submissionId, grade, feedback }: { submissionId: string; grade: number; feedback: string }) =>
      assignmentService.gradeSubmission(submissionId, grade, feedback, user?.id ?? ""),
    onSuccess: (res) => {
      if (res.success && res.data) {
        // Invalidate all submissions lists to ensure the UI updates
        queryClient.invalidateQueries({ queryKey: ["submissions"] });
        // Also invalidate specific student dashboard data
        queryClient.invalidateQueries({ queryKey: ["assignments"] });
      }
    },
  });
}
