import { useEffect } from "react";
import { toast } from "sonner";

interface UpdatePromptProps {
  showUpdate: boolean;
  onUpdate: () => void;
}

export function UpdatePrompt({ showUpdate, onUpdate }: UpdatePromptProps) {
  useEffect(() => {
    if (!showUpdate) return;

    toast("A new version is available", {
      duration: Infinity,
      action: {
        label: "Update now",
        onClick: onUpdate,
      },
    });
  }, [showUpdate, onUpdate]);

  return null;
}
