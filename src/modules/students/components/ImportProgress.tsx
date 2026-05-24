import React from "react";

interface Props {
  done: number;
  total: number;
  current?: number;
}

export function ImportProgress({ done, total }: Props) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Progress</span>
        <span>{pct}%</span>
      </div>
      <div className="w-full rounded-lg bg-muted/30 h-3 overflow-hidden">
        <div className="h-3 bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-muted-foreground">{done}/{total} processed</div>
    </div>
  );
}

export default ImportProgress;
