import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import {
  getTemplatesByInstitute,
  deleteTemplate,
  createIssuedCertificates,
} from "@/services/certificate.service";
import { generateBulkCertificatePdf } from "@/services/pdf/certificatePdf.service";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  GraduationCap,
  Plus,
  Trash2,
  Edit,
  Download,
  Loader2,
  FileText,
  Users,
} from "lucide-react";
import type { CertificateTemplate, CertificateCustomData } from "@/types";

export const Route = createFileRoute("/dashboard/admin/certificates/")({
  head: () => ({ meta: [{ title: "Certificates — EliteClass" }] }),
  component: CertificatesPage,
});

// ── Templates Tab ────────────────────────────────────────────────────────────

function TemplatesTab() {
  const { user } = useAuthStore();
  const [templates, setTemplates] = useState<CertificateTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.institute_id) return;
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.institute_id]);

  async function loadTemplates() {
    setIsLoading(true);
    const result = await getTemplatesByInstitute(user!.institute_id);
    if (result.success && result.data) {
      setTemplates(result.data);
    } else {
      toast.error(result.error ?? "Failed to load templates.");
    }
    setIsLoading(false);
  }

  async function handleDelete(templateId: string) {
    if (!confirm("Are you sure you want to delete this template? This cannot be undone.")) return;
    setDeletingId(templateId);
    const result = await deleteTemplate(templateId);
    if (result.success) {
      toast.success("Template deleted.");
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    } else {
      toast.error(result.error ?? "Failed to delete template.");
    }
    setDeletingId(null);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">No certificate templates yet.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Create your first template to start generating certificates.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {templates.map((template) => (
        <Card key={template.id}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{template.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground line-clamp-2">{template.title}</p>
            <p className="text-xs text-muted-foreground">
              Signatory: {template.signatory_name}
            </p>
            <div className="flex items-center gap-2 pt-2">
              <Button variant="outline" size="sm" asChild>
                <a href={`/dashboard/admin/certificates/${template.id}/edit`}>
                  <Edit className="mr-1 h-3.5 w-3.5" />
                  Edit
                </a>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => handleDelete(template.id)}
                disabled={deletingId === template.id}
              >
                {deletingId === template.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Delete
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Generate Tab ─────────────────────────────────────────────────────────────

interface StudentOption {
  id: string;
  name: string;
  admission_no: string;
  batch_id: string | null;
  batch_name: string | null;
}

function GenerateTab() {
  const { user } = useAuthStore();
  const [templates, setTemplates] = useState<CertificateTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [filteredStudents, setFilteredStudents] = useState<StudentOption[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [batchFilter, setBatchFilter] = useState("");
  const [searchFilter, setSearchFilter] = useState("");
  const [customData, setCustomData] = useState<CertificateCustomData>({
    start_date: "",
    end_date: "",
    role: "",
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);

  useEffect(() => {
    if (!user?.institute_id) return;
    loadTemplates();
    loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.institute_id]);

  useEffect(() => {
    let filtered = students;
    if (batchFilter) {
      filtered = filtered.filter((s) => s.batch_id === batchFilter);
    }
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(q) || s.admission_no.toLowerCase().includes(q),
      );
    }
    setFilteredStudents(filtered);
  }, [students, batchFilter, searchFilter]);

  async function loadTemplates() {
    const result = await getTemplatesByInstitute(user!.institute_id);
    if (result.success && result.data) setTemplates(result.data);
  }

  async function loadStudents() {
    if (!supabase || !user?.institute_id) return;
    setIsLoadingStudents(true);
    const { data, error } = await supabase
      .from("students")
      .select("id, user:users(name), admission_no, batch_id, batch:batches(name)")
      .eq("institute_id", user.institute_id)
      .eq("status", "active");

    if (!error && data) {
      setStudents(
        data.map((s: any) => ({
          id: s.id,
          name: s.user?.name ?? "Unknown",
          admission_no: s.admission_no ?? "",
          batch_id: s.batch_id,
          batch_name: s.batch?.name ?? null,
        })),
      );
    }
    setIsLoadingStudents(false);
  }

  function toggleStudent(studentId: string) {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function selectAll() {
    setSelectedStudentIds(new Set(filteredStudents.map((s) => s.id)));
  }

  function deselectAll() {
    setSelectedStudentIds(new Set());
  }

  async function handleGenerate() {
    if (!selectedTemplateId) {
      toast.error("Please select a template.");
      return;
    }
    if (selectedStudentIds.size === 0) {
      toast.error("Please select at least one student.");
      return;
    }
    if (selectedStudentIds.size > 500) {
      toast.error("Maximum 500 students per batch.");
      return;
    }

    const template = templates.find((t) => t.id === selectedTemplateId);
    if (!template) return;

    const selectedStudents = students.filter((s) => selectedStudentIds.has(s.id));

    setIsGenerating(true);
    setProgress({ current: 0, total: selectedStudents.length });

    try {
      const blob = await generateBulkCertificatePdf(
        template,
        selectedStudents.map((s) => ({
          name: s.name,
          customData: {
            ...customData,
            batch_name: s.batch_name ?? "",
            date_issued: new Date().toLocaleDateString(),
          },
        })),
        (current, total) => setProgress({ current, total }),
      );

      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `certificates-${template.name.replace(/\s+/g, "-").toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Record issued certificates
      if (user) {
        await createIssuedCertificates(
          selectedStudents.map((s) => ({
            template_id: template.id,
            student_id: s.id,
            institute_id: user.institute_id,
            issued_by: user.id,
            custom_data: {
              ...customData,
              batch_name: s.batch_name ?? "",
              date_issued: new Date().toISOString(),
            },
          })),
        );
      }

      toast.success(`Generated ${selectedStudents.length} certificate(s).`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to generate certificates.");
    } finally {
      setIsGenerating(false);
    }
  }

  const batches = Array.from(
    new Map(
      students
        .filter((s) => s.batch_id && s.batch_name)
        .map((s) => [s.batch_id!, s.batch_name!]),
    ),
  );

  return (
    <div className="space-y-6">
      {/* Template Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Select Template</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
          >
            <option value="">Choose a template...</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Student Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. Select Students</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Input
              placeholder="Search students..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="max-w-xs"
            />
            <select
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
              value={batchFilter}
              onChange={(e) => setBatchFilter(e.target.value)}
            >
              <option value="">All Batches</option>
              {batches.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={selectAll}>
              Select All
            </Button>
            <Button variant="outline" size="sm" onClick={deselectAll}>
              Deselect All
            </Button>
          </div>

          <p className="text-sm text-muted-foreground">
            {selectedStudentIds.size} of {filteredStudents.length} student(s) selected
            {selectedStudentIds.size > 500 && (
              <span className="ml-2 text-destructive">(max 500)</span>
            )}
          </p>

          {isLoadingStudents ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-border">
              {filteredStudents.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  No students found.
                </p>
              ) : (
                filteredStudents.map((student) => (
                  <label
                    key={student.id}
                    className="flex cursor-pointer items-center gap-3 border-b border-border px-4 py-2 last:border-b-0 hover:bg-accent/5"
                  >
                    <input
                      type="checkbox"
                      checked={selectedStudentIds.has(student.id)}
                      onChange={() => toggleStudent(student.id)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium">{student.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {student.admission_no}
                      </span>
                    </div>
                    {student.batch_name && (
                      <span className="text-xs text-muted-foreground">{student.batch_name}</span>
                    )}
                  </label>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Custom Data */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">3. Custom Fields</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="start_date">Start Date</Label>
              <Input
                id="start_date"
                type="date"
                value={customData.start_date ?? ""}
                onChange={(e) => setCustomData((d) => ({ ...d, start_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end_date">End Date</Label>
              <Input
                id="end_date"
                type="date"
                value={customData.end_date ?? ""}
                onChange={(e) => setCustomData((d) => ({ ...d, end_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role">Role / Position</Label>
              <Input
                id="role"
                placeholder="e.g. Intern, Participant"
                value={customData.role ?? ""}
                onChange={(e) => setCustomData((d) => ({ ...d, role: e.target.value }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Generate Button */}
      <div className="flex items-center gap-4">
        <Button
          onClick={handleGenerate}
          disabled={
            isGenerating || !selectedTemplateId || selectedStudentIds.size === 0 || selectedStudentIds.size > 500
          }
          className="gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating ({progress.current}/{progress.total})...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Generate & Download
            </>
          )}
        </Button>
        {isGenerating && (
          <div className="flex-1">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

function CertificatesPage() {
  return (
    <ProtectedRoute allowedRoles={["admin", "staff"]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Certificates</h1>
            <p className="text-muted-foreground mt-1">
              Manage templates and generate bulk certificates for students.
            </p>
          </div>
          <Button asChild>
            <a href="/dashboard/admin/certificates/new">
              <Plus className="mr-2 h-4 w-4" />
              New Template
            </a>
          </Button>
        </div>

        <Tabs defaultValue="templates">
          <TabsList>
            <TabsTrigger value="templates" className="gap-2">
              <FileText className="h-4 w-4" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="generate" className="gap-2">
              <Users className="h-4 w-4" />
              Generate
            </TabsTrigger>
          </TabsList>
          <TabsContent value="templates" className="mt-4">
            <TemplatesTab />
          </TabsContent>
          <TabsContent value="generate" className="mt-4">
            <GenerateTab />
          </TabsContent>
        </Tabs>
      </div>
    </ProtectedRoute>
  );
}
