import type { Batch } from "@/types";

const INPUT_CLASS =
  "rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

interface AnalyticsFiltersBarProps {
  batches: Batch[];
  batchId: string;
  dateFrom: string;
  dateTo: string;
  onBatchChange: (id: string) => void;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
}

export function AnalyticsFiltersBar({
  batches,
  batchId,
  dateFrom,
  dateTo,
  onBatchChange,
  onDateFromChange,
  onDateToChange,
}: AnalyticsFiltersBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card/50 p-4">
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Batch</label>
        <select value={batchId} onChange={(e) => onBatchChange(e.target.value)} className={INPUT_CLASS}>
          <option value="">All batches</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">From</label>
        <input type="date" value={dateFrom} onChange={(e) => onDateFromChange(e.target.value)} className={INPUT_CLASS} />
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">To</label>
        <input type="date" value={dateTo} onChange={(e) => onDateToChange(e.target.value)} className={INPUT_CLASS} />
      </div>
    </div>
  );
}
