import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Student } from "@/types";
import { cn } from "@/lib/utils";
import { Mail, Phone, ShieldCheck, User } from "lucide-react";

interface StudentProfileCardProps {
  student: Student;
  attendanceRate: number;
  lastUpdated?: string | null;
}

function getInitials(name?: string | null): string {
  if (!name) return "S";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function StudentProfileCard({
  student,
  attendanceRate,
  lastUpdated,
}: StudentProfileCardProps) {
  const user = student.user;
  const emergencyContact = student.emergency_contact;

  return (
    <Card className="border-border/60 bg-card/90 shadow-sm backdrop-blur">
      <CardHeader className="space-y-4 border-b border-border/60 bg-gradient-to-br from-background via-background to-muted/30 pb-6">
        <div className="flex items-start gap-4">
          <Avatar className="size-16 ring-2 ring-primary/10">
            <AvatarImage
              src={user?.avatar_url ?? undefined}
              alt={user?.name ?? student.admission_no}
            />
            <AvatarFallback className="bg-primary/10 text-base font-semibold text-primary">
              {getInitials(user?.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-2xl">{user?.name ?? "Student profile"}</CardTitle>
              <StatusBadge status={student.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Admission No. {student.admission_no}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="secondary" className="gap-1.5">
                <ShieldCheck className="size-3.5" />
                Attendance {attendanceRate}%
              </Badge>
              {lastUpdated ? (
                <Badge variant="outline" className="gap-1.5">
                  <User className="size-3.5" />
                  Updated {new Date(lastUpdated).toLocaleDateString()}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-6 md:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Mail className="size-4 text-primary" />
            Contact
          </div>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>{user?.email ?? "No email linked"}</p>
            <p>{user?.phone ?? "No phone linked"}</p>
          </div>
        </div>
        <div className="space-y-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Phone className="size-4 text-primary" />
            Emergency Contact
          </div>
          <div
            className={cn(
              "space-y-1 text-sm",
              emergencyContact ? "text-muted-foreground" : "text-muted-foreground",
            )}
          >
            {emergencyContact ? (
              <>
                <p className="font-medium text-foreground">{emergencyContact.name}</p>
                <p>{emergencyContact.phone}</p>
                <p>{emergencyContact.relation}</p>
              </>
            ) : (
              <p>No emergency contact recorded.</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
