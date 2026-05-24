import { useQuery } from "@tanstack/react-query";
import { getAssignees } from "../services/exam.service";

export function useExamAssignees(examId: string) {
  return useQuery({
    queryKey: ["exam-assignees", examId],
    queryFn: () => getAssignees(examId),
    enabled: !!examId,
  });
}
