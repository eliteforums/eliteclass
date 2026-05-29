import React from "react";
import { Eye, Camera, Shield } from "lucide-react";

interface ProctoringStatusBadgesProps {
  enableTabDetection: boolean;
  enableCameraMic: boolean;
  enableDeterrentUi: boolean;
}

export function ProctoringStatusBadges({
  enableTabDetection,
  enableCameraMic,
  enableDeterrentUi,
}: ProctoringStatusBadgesProps) {
  const hasAny = enableTabDetection || enableCameraMic || enableDeterrentUi;

  if (!hasAny) return null;

  return (
    <div className="flex items-center gap-1.5">
      {enableTabDetection && (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700"
          title="Tab Detection"
        >
          <Eye className="h-3 w-3" />
          Tab
        </span>
      )}
      {enableCameraMic && (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
          title="Camera/Mic"
        >
          <Camera className="h-3 w-3" />
          Cam
        </span>
      )}
      {enableDeterrentUi && (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700"
          title="Deterrent UI"
        >
          <Shield className="h-3 w-3" />
          Deterrent
        </span>
      )}
    </div>
  );
}
