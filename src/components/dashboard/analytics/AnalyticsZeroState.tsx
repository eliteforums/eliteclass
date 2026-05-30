import { BarChart3 } from "lucide-react";

interface AnalyticsZeroStateProps {
  dateFrom: string;
  dateTo: string;
  batchName?: string;
}

export function AnalyticsZeroState({ dateFrom, dateTo, batchName }: AnalyticsZeroStateProps) {
  const formattedFrom = new Date(dateFrom).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const formattedTo = new Date(dateTo).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card/50 px-6 py-12 text-center">
      <BarChart3 className="h-10 w-10 text-muted-foreground/50 mb-4" />
      <h3 className="text-lg font-semibold text-foreground mb-2">No data available</h3>
      <p className="text-sm text-muted-foreground max-w-md">
        No records found for the period{" "}
        <span className="font-medium text-foreground">{formattedFrom}</span> to{" "}
        <span className="font-medium text-foreground">{formattedTo}</span>
        {batchName && (
          <>
            {" "}
            in batch <span className="font-medium text-foreground">{batchName}</span>
          </>
        )}
        .
      </p>
      <p className="text-xs text-muted-foreground mt-2">
        Try adjusting the date range or batch filter to see analytics data.
      </p>
    </div>
  );
}
