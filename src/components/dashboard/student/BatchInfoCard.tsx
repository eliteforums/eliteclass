import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StudentBatchInfo } from "@/types";
import { CalendarDays, GraduationCap, Hash, Users } from "lucide-react";

interface BatchInfoCardProps {
  batch: StudentBatchInfo | null;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Not available";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function BatchInfoCard({ batch }: BatchInfoCardProps) {
  return (
    <Card className="border-border/60 bg-card/90 shadow-sm backdrop-blur">
      <CardHeader className="border-b border-border/60 bg-gradient-to-br from-muted/30 via-background to-background pb-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
              Batch details
            </p>
            <CardTitle className="mt-1 text-xl">Assigned batch</CardTitle>
          </div>
          <Badge variant="outline" className="gap-1.5">
            <GraduationCap className="size-3.5" />
            {batch ? (batch.is_active ? "Active" : "Inactive") : "Unassigned"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-6">
        {batch ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Hash className="size-4 text-primary" />
                  Batch name
                </div>
                <p className="mt-2 text-lg font-semibold text-foreground">{batch.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{batch.batch_code ?? ""}</p>
              </div>
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Users className="size-4 text-primary" />
                  Strength
                </div>
                <p className="mt-2 text-lg font-semibold text-foreground">
                  {batch.student_count ?? 0}
                  {batch.capacity ? `/${batch.capacity}` : ""}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">Students enrolled</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <InfoPill label="Course" value={batch.course_name ?? "—"} />
              <InfoPill label="Academic year" value={batch.academic_year} />
              <InfoPill
                label="Start"
                value={batch.start_date ? formatDate(batch.start_date) : "—"}
              />
              <InfoPill label="End" value={batch.end_date ? formatDate(batch.end_date) : "—"} />
            </div>
            <div className="rounded-2xl border border-dashed border-border/60 bg-background/80 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <CalendarDays className="size-4 text-primary" />
                Timing
              </div>
              <p className="mt-2 text-sm text-foreground">
                View your weekly class timetable in the section below.
              </p>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-6 text-sm text-muted-foreground">
            No batch assignment has been linked to this student yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
