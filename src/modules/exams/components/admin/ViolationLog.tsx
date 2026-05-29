import React from "react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import type { ExamViolation } from "../../types";

interface ViolationLogProps {
  violations: ExamViolation[];
}

const violationTypeLabels: Record<string, string> = {
  tab_switch: "Tab Switch",
  window_blur: "Window Blur",
  camera_interrupted: "Camera Interrupted",
  proctoring_interruption: "Proctoring Interruption",
};

function getViolationBadgeClass(type: string): string {
  switch (type) {
    case "tab_switch":
    case "window_blur":
      return "bg-red-100 text-red-800 border-red-200";
    case "camera_interrupted":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "proctoring_interruption":
      return "bg-orange-100 text-orange-800 border-orange-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
}

export function ViolationLog({ violations }: ViolationLogProps) {
  if (!violations || violations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mb-2 opacity-40" />
        <p className="text-sm">No violations recorded</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="pb-2 pr-4 font-medium text-muted-foreground">Time</th>
            <th className="pb-2 pr-4 font-medium text-muted-foreground">Type</th>
            <th className="pb-2 font-medium text-muted-foreground">Details</th>
          </tr>
        </thead>
        <tbody>
          {violations.map((violation) => (
            <tr key={violation.id} className="border-b last:border-0">
              <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                {format(new Date(violation.timestamp), "MMM d, h:mm:ss a")}
              </td>
              <td className="py-2 pr-4">
                <Badge
                  variant="outline"
                  className={getViolationBadgeClass(violation.violation_type)}
                >
                  {violationTypeLabels[violation.violation_type] || violation.violation_type}
                </Badge>
              </td>
              <td className="py-2 text-muted-foreground">
                {violation.violation_data
                  ? typeof violation.violation_data === "string"
                    ? violation.violation_data
                    : violation.violation_data.details || JSON.stringify(violation.violation_data)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
