import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import { getIssuedCertificatesByStudent } from "@/services/certificate.service";
import { generateSingleCertificatePdf } from "@/services/pdf/certificatePdf.service";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, GraduationCap, Loader2 } from "lucide-react";
import type { IssuedCertificate } from "@/types";

export const Route = createFileRoute("/dashboard/student/certificates")({
  head: () => ({ meta: [{ title: "My Certificates — EliteClass" }] }),
  component: StudentCertificatesPage,
});

function StudentCertificatesPage() {
  const { user } = useAuthStore();
  const [certificates, setCertificates] = useState<IssuedCertificate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !supabase) {
      setIsLoading(false);
      return;
    }

    async function loadCertificates() {
      setIsLoading(true);
      setError(null);

      try {
        // Get the student record for the current user
        const { data: student } = await supabase!
          .from("students")
          .select("id")
          .eq("user_id", user!.id)
          .single();

        if (!student) {
          setError("Student record not found.");
          setIsLoading(false);
          return;
        }

        const result = await getIssuedCertificatesByStudent(student.id, user!.institute_id);
        if (result.success && result.data) {
          setCertificates(result.data);
        } else {
          setError(result.error ?? "Failed to load certificates.");
        }
      } catch {
        setError("An unexpected error occurred.");
      } finally {
        setIsLoading(false);
      }
    }

    loadCertificates();
  }, [user]);

  async function handleDownload(certificate: IssuedCertificate) {
    if (!certificate.template) {
      toast.error("Template data not available.");
      return;
    }

    setDownloadingId(certificate.id);

    try {
      const blob = await generateSingleCertificatePdf(
        certificate.template,
        user?.name ?? "Student",
        certificate.custom_data,
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `certificate-${certificate.template.name.replace(/\s+/g, "-").toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Certificate downloaded.");
    } catch {
      toast.error("Failed to generate certificate PDF.");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <ProtectedRoute allowedRoles={["student"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Certificates</h1>
          <p className="text-muted-foreground mt-1">
            View and download your issued certificates.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">{error}</CardContent>
          </Card>
        ) : certificates.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <GraduationCap className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">No certificates issued yet.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Certificates will appear here once issued by your institute.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {certificates.map((cert) => (
              <Card key={cert.id}>
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <GraduationCap className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">
                        {cert.template?.name ?? "Certificate"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{cert.template?.title ?? ""}</span>
                      <span>
                        Issued {new Date(cert.issued_at).toLocaleDateString()}
                      </span>
                    </div>
                    {cert.custom_data.role && (
                      <p className="text-xs text-muted-foreground">
                        Role: {cert.custom_data.role}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownload(cert)}
                    disabled={downloadingId === cert.id}
                  >
                    {downloadingId === cert.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <Download className="mr-1 h-3.5 w-3.5" />
                        Download
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
