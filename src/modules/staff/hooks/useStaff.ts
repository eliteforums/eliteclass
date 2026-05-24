import { useState, useCallback, useEffect } from "react";
import { getStaffByInstitute, removeStaff } from "@/services/staff.service";
import { getErrorMessage } from "@/utils/helpers";
import type { Staff, ApiResponse } from "@/types";

interface UseStaffProps {
  instituteId: string | null;
}

export function useStaff({ instituteId }: UseStaffProps) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStaff = useCallback(async () => {
    if (!instituteId) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await getStaffByInstitute(instituteId);
      if (res.success && res.data) {
        setStaff(res.data);
      } else {
        setError(res.error);
      }
    } catch (err: any) {
      setError(getErrorMessage(err, "Failed to fetch staff"));
    } finally {
      setIsLoading(false);
    }
  }, [instituteId]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  const deleteStaffMember = async (id: string) => {
    const res = await removeStaff(id);
    if (res.success) {
      setStaff((prev) => prev.filter((s) => s.id !== id));
    }
    return res;
  };

  return {
    staff,
    isLoading,
    error,
    fetchStaff,
    deleteStaffMember,
  };
}
