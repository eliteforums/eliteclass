import { useEffect, useState, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase";
import {
  getTemplatesByInstitute,
  deleteTemplate,
  createTemplate,
  updateTemplate,
  createIssuedCertificates,
} from "@/services/certificate.service";
import {
  generateBulkCertificatePdf,
  generateSingleCertificatePdf,
} from "@/services/pdf/certificatePdf.service";
import { PREBUILT_TEMPLATES } from "@/services/certificate-templates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Edit,
  Download,
  Loader2,
  FileText,
  Users,
  Eye,
  Save,
  X,
  ArrowLeft,
} from "lucide-react";
import type { CertificateTemplate, CertificateCustomData } from "@/types";

export const Route = createFileRoute("/dashboard/admin/certificates/")({
  head: () => ({ meta: [{ title: "Certificates — EliteClass" }] }),
  component: CertificatesPage,
});

// ── Template Editor (inline) ─────────────────────────────────────────────────

function TemplateEditor({
  template,
  onSave,
  onCancel,
}: {
  template: Partial<CertificateTemplate> | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { user } = useAuthStore();
  const [name, setName] = useState(template?.name ?? "");
  const [title, setTitle] = useState(template?.title ?? "");
  const [bodyText, setBodyText] = useState(template?.body_text ?? "");
  const [signatoryName, setSignatoryName] = useState(template?.signatory_name ?? "");
  const [signatoryDesignation, setSignatoryDesignation] = useState(template?.signatory_designation ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewRef = useRef<HTMLIFrameElement>(null);

  // Generate live preview
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!title && !bodyText) return;
      try {
        const blob = await generateSingleCertificatePdf(
          {
            id: "",
            institute_id: "",
            name: name || "Preview",
            title: title || "Certificate Title",
            body_text: bodyText || "Certificate body text...",
            logo_url: null,
            seal_url: null,
            signatory_name: signatoryName || "Signatory Name",
            signatory_designation: signatoryDesignation || "Designation",
            created_by: "",
            created_at: "",
            updated_at: "",
          },
          "Sample Student Name",
          {
            start_date: "01 January 2025",
            end_date: "01 March 2025",
            role: "Web Developer Intern",
            batch_name: "Batch A",
            course_name: "Full Stack Development",
            date_issued: new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "2-digit" }),
          },
        );
        const url = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
      } catch {
        // Preview generation failed silently
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [name, title, bodyText, signatoryName, signatoryDesignation]);

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, []);

  async function handleSave() {
    if (!user || !name.trim() || !title.trim() || !bodyText.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }

    setIsSaving(true);
    try {
      if (template?.id) {
        // Update existing
        const result = await updateTemplate(template.id, {
          name: name.trim(),
          title: title.trim(),
          body_text: bodyText.trim(),
          signatory_name: signatoryName.trim(),
          signatory_designation: signatoryDesignation.trim(),
        });
        if (result.success) {
          toast.success("Template updated!");
          onSave();
        } else {
          toast.error(result.error ?? "Failed to update template.");
        }
      } else {
        // Create new
        const result = await createTemplate({
          institute_id: user.institute_id,
          name: name.trim(),
          title: title.trim(),
          body_text: bodyText.trim(),
          signatory_name: signatoryName.trim(),
          signatory_designation: signatoryDesignation.trim(),
          created_by: user.id,
        });
        if (result.success) {
          toast.success("Template created!");
          onSave();
        } else {
          toast.error(result.error ?? "Failed to create template.");
        }
      }
    } finally {
      setIsSaving(false);
    }
  }

  function insertPlaceholder(placeholder: string) {
    setBodyText((prev) => prev + placeholder);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <h2 className="text-lg font-semibold">
          {template?.id ? "Edit Template" : "Create Template"}
        </h2>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Form */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Template Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Internship Completion Letter" />
          </div>

          <div className="space-y-1.5">
            <Label>Certificate Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Offer Letter for {{role}}" />
          </div>

          <div className="space-y-1.5">
            <Label>Body Text *</Label>
            <div className="flex flex-wrap gap-1 mb-2">
              <span className="text-xs text-muted-foreground mr-1">Insert:</span>
              {["{{student_name}}", "{{role}}", "{{start_date}}", "{{end_date}}", "{{batch_name}}", "{{course_name}}", "{{date_issued}}"].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => insertPlaceholder(p)}
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground hover:bg-primary/10 hover:text-primary"
                >
                  {p}
                </button>
              ))}
            </div>
            <Textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Dear {{student_name}},&#10;&#10;This is to certify that..."
              className="min-h-[200px] font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Signatory Name *</Label>
              <Input value={signatoryName} onChange={(e) => setSignatoryName(e.target.value)} placeholder="Harsh Tambade" />
            </div>
            <div className="space-y-1.5">
              <Label>Signatory Designation *</Label>
              <Input value={signatoryDesignation} onChange={(e) => setSignatoryDesignation(e.target.value)} placeholder="Founder and CEO" />
            </div>
          </div>

          <Button onClick={handleSave} disabled={isSaving} className="w-full">
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {template?.id ? "Update Template" : "Create Template"}
          </Button>
        </div>

        {/* Live Preview */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Eye className="h-4 w-4" />
            Live Preview
          </div>
          <div className="rounded-lg border border-border bg-muted/30 overflow-hidden" style={{ height: "600px" }}>
            {previewUrl ? (
              <iframe
                ref={previewRef}
                src={previewUrl}
                className="w-full h-full"
                title="Certificate Preview"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                Start typing to see a live preview...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Templates Tab ────────────────────────────────────────────────────────────

function TemplatesTab() {
  const { user } = useAuthStore();
  const [templates, setTemplates] = useState<CertificateTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<CertificateTemplate | null | "new">(null);

  useEffect(() => {
    if (!user?.institute_id) return;
    loadTemplates();
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
    if (!confirm("Delete this template? This cannot be undone.")) return;
    setDeletingId(templateId);
    const result = await deleteTemplate(templateId);
    if (result.success) {
      toast.success("Template deleted.");
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    } else {
      toast.error(result.error ?? "Failed to delete.");
    }
    setDeletingId(null);
  }

  // Show editor
  if (editingTemplate !== null) {
    const editorKey = editingTemplate === "new" ? "new" : editingTemplate.id;
    return (
      <TemplateEditor
        key={editorKey}
        template={editingTemplate === "new" ? null : editingTemplate}
        onSave={() => {
          setEditingTemplate(null);
          loadTemplates();
        }}
        onCancel={() => setEditingTemplate(null)}
      />
    );
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
      <div className="space-y-6">
        <Card>
          <CardContent className="py-8 text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">No certificate templates yet.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Choose a pre-built template below or create your own.
            </p>
            <Button className="mt-4" onClick={() => setEditingTemplate("new")}>
              <Plus className="mr-2 h-4 w-4" />
              Create Custom Template
            </Button>
          </CardContent>
        </Card>

        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Pre-built Templates</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PREBUILT_TEMPLATES.map((pt) => (
              <Card key={pt.id} className="border-dashed">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{pt.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground line-clamp-3">{pt.body_text.slice(0, 120)}...</p>
                  <p className="text-xs text-muted-foreground">Signatory: {pt.signatory_name}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={async () => {
                      if (!user) return;
                      const result = await createTemplate({
                        institute_id: user.institute_id,
                        name: pt.name,
                        title: pt.title,
                        body_text: pt.body_text,
                        signatory_name: pt.signatory_name,
                        signatory_designation: pt.signatory_designation,
                        created_by: user.id,
                      });
                      if (result.success) {
                        toast.success(`Template "${pt.name}" added!`);
                        loadTemplates();
                      } else {
                        toast.error(result.error ?? "Failed to add template.");
                      }
                    }}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Use This Template
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditingTemplate("new")}>
          <Plus className="mr-2 h-4 w-4" />
          New Template
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((template) => (
          <Card key={template.id}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{template.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground line-clamp-2">{template.title}</p>
              <p className="text-xs text-muted-foreground">Signatory: {template.signatory_name}</p>
              <div className="flex items-center gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setEditingTemplate(template)}>
                  <Edit className="mr-1 h-3.5 w-3.5" />
                  Edit
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
                    <><Trash2 className="mr-1 h-3.5 w-3.5" />Delete</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
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
  const [customData, setCustomData] = useState<CertificateCustomData>({ start_date: "", end_date: "", role: "" });
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.institute_id) return;
    loadTemplates();
    loadStudents();
  }, [user?.institute_id]);

  useEffect(() => {
    let filtered = students;
    if (batchFilter) filtered = filtered.filter((s) => s.batch_id === batchFilter);
    if (searchFilter) {
      const q = searchFilter.toLowerCase();
      filtered = filtered.filter((s) => s.name.toLowerCase().includes(q) || s.admission_no.toLowerCase().includes(q));
    }
    setFilteredStudents(filtered);
  }, [students, batchFilter, searchFilter]);

  // Generate preview when template is selected
  useEffect(() => {
    if (!selectedTemplateId) {
      setPreviewUrl(null);
      return;
    }
    const template = templates.find((t) => t.id === selectedTemplateId);
    if (!template) return;

    generateSingleCertificatePdf(template, "Sample Student Name", {
      ...customData,
      date_issued: new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "2-digit" }),
      batch_name: "Sample Batch",
    }).then((blob) => {
      const url = URL.createObjectURL(blob);
      setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
    }).catch(() => {});
  }, [selectedTemplateId, customData, templates]);

  async function loadTemplates() {
    const result = await getTemplatesByInstitute(user!.institute_id);
    if (result.success && result.data) setTemplates(result.data);
  }

  async function loadStudents() {
    if (!supabase || !user?.institute_id) return;
    setIsLoadingStudents(true);
    const { data } = await supabase
      .from("students")
      .select("id, user:users(name), admission_no, batch_id, batch:batches(name)")
      .eq("institute_id", user.institute_id)
      .eq("status", "active");
    if (data) {
      setStudents(data.map((s: any) => ({
        id: s.id, name: s.user?.name ?? "Unknown", admission_no: s.admission_no ?? "",
        batch_id: s.batch_id, batch_name: s.batch?.name ?? null,
      })));
    }
    setIsLoadingStudents(false);
  }

  function toggleStudent(id: string) {
    setSelectedStudentIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function selectAll() { setSelectedStudentIds(new Set(filteredStudents.map((s) => s.id))); }
  function deselectAll() { setSelectedStudentIds(new Set()); }

  async function handleGenerate() {
    if (!selectedTemplateId) { toast.error("Select a template."); return; }
    if (selectedStudentIds.size === 0) { toast.error("Select at least one student."); return; }

    const template = templates.find((t) => t.id === selectedTemplateId);
    if (!template) return;

    const selected = students.filter((s) => selectedStudentIds.has(s.id));
    setIsGenerating(true);
    setProgress({ current: 0, total: selected.length });

    try {
      const blob = await generateBulkCertificatePdf(
        template,
        selected.map((s) => ({ name: s.name, customData: { ...customData, batch_name: s.batch_name ?? "", date_issued: new Date().toLocaleDateString() } })),
        (c, t) => setProgress({ current: c, total: t }),
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `certificates-${template.name.replace(/\s+/g, "-").toLowerCase()}.pdf`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (user) {
        await createIssuedCertificates(selected.map((s) => ({
          template_id: template.id, student_id: s.id, institute_id: user.institute_id,
          issued_by: user.id, custom_data: { ...customData, batch_name: s.batch_name ?? "", date_issued: new Date().toISOString() },
        })));
      }
      toast.success(`Generated ${selected.length} certificate(s).`);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to generate.");
    } finally {
      setIsGenerating(false);
    }
  }

  const batches = Array.from(new Map(students.filter((s) => s.batch_id && s.batch_name).map((s) => [s.batch_id!, s.batch_name!])));

  return (
    <div className="space-y-6">
      {/* Step 1: Template + Preview */}
      <Card>
        <CardHeader><CardTitle className="text-base">1. Select Template</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <select className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
            <option value="">Choose a template...</option>
            {templates.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}
          </select>
          {templates.length === 0 && (
            <p className="text-sm text-muted-foreground">No templates yet. Go to the Templates tab to create one first.</p>
          )}
          {previewUrl && (
            <div className="rounded-lg border overflow-hidden" style={{ height: "400px" }}>
              <iframe src={previewUrl} className="w-full h-full" title="Preview" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Custom Fields */}
      <Card>
        <CardHeader><CardTitle className="text-base">2. Custom Fields</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input type="date" value={customData.start_date ?? ""} onChange={(e) => setCustomData((d) => ({ ...d, start_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Input type="date" value={customData.end_date ?? ""} onChange={(e) => setCustomData((d) => ({ ...d, end_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Role / Position</Label>
              <Input placeholder="e.g. Intern, Participant" value={customData.role ?? ""} onChange={(e) => setCustomData((d) => ({ ...d, role: e.target.value }))} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 3: Students */}
      <Card>
        <CardHeader><CardTitle className="text-base">3. Select Students</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Input placeholder="Search..." value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} className="max-w-xs" />
            <select className="rounded-lg border border-input bg-background px-3 py-2 text-sm" value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)}>
              <option value="">All Batches</option>
              {batches.map(([id, name]) => (<option key={id} value={id}>{name}</option>))}
            </select>
            <Button variant="outline" size="sm" onClick={selectAll}>Select All</Button>
            <Button variant="outline" size="sm" onClick={deselectAll}>Deselect All</Button>
          </div>
          <p className="text-sm text-muted-foreground">{selectedStudentIds.size} of {filteredStudents.length} selected</p>
          {isLoadingStudents ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-lg border">
              {filteredStudents.length === 0 ? (
                <p className="p-4 text-center text-sm text-muted-foreground">No students found.</p>
              ) : filteredStudents.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-3 border-b px-4 py-2 last:border-0 hover:bg-accent/5">
                  <input type="checkbox" checked={selectedStudentIds.has(s.id)} onChange={() => toggleStudent(s.id)} className="h-4 w-4 rounded" />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium">{s.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{s.admission_no}</span>
                  </div>
                  {s.batch_name && <span className="text-xs text-muted-foreground">{s.batch_name}</span>}
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Generate */}
      <div className="flex items-center gap-4">
        <Button onClick={handleGenerate} disabled={isGenerating || !selectedTemplateId || selectedStudentIds.size === 0} className="gap-2">
          {isGenerating ? (<><Loader2 className="h-4 w-4 animate-spin" />Generating ({progress.current}/{progress.total})...</>) : (<><Download className="h-4 w-4" />Generate & Download</>)}
        </Button>
        {isGenerating && (
          <div className="flex-1"><div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }} /></div></div>
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
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Certificates</h1>
          <p className="text-muted-foreground mt-1">Manage templates and generate bulk certificates for students.</p>
        </div>
        <Tabs defaultValue="templates">
          <TabsList>
            <TabsTrigger value="templates" className="gap-2"><FileText className="h-4 w-4" />Templates</TabsTrigger>
            <TabsTrigger value="generate" className="gap-2"><Users className="h-4 w-4" />Generate</TabsTrigger>
          </TabsList>
          <TabsContent value="templates" className="mt-4"><TemplatesTab /></TabsContent>
          <TabsContent value="generate" className="mt-4"><GenerateTab /></TabsContent>
        </Tabs>
      </div>
    </ProtectedRoute>
  );
}
