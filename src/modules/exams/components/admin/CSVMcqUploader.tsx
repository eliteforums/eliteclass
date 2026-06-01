import React, { useState, useCallback, useRef } from "react";
import {
  Upload,
  FileText,
  Download,
  Loader2,
  CheckCircle2,
  X,
  ChevronLeft,
  Trash2,
  AlertCircle,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { parseCSVMCQ, generateCSVTemplate, type CSVQuestion } from "../../services/csvMcqParser";
import { addQuestion } from "../../services/exam.service";
import { cn } from "@/lib/utils";

interface CSVMcqUploaderProps {
  examId: string;
  onQuestionsAdded: () => void;
}

type Step = "upload" | "review" | "saving";

export function CSVMcqUploader({ examId, onQuestionsAdded }: CSVMcqUploaderProps) {
  // Step state
  const [step, setStep] = useState<Step>("upload");

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [questions, setQuestions] = useState<CSVQuestion[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);

  // Saving state
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState({ saved: 0, total: 0 });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // ── File Upload ──────────────────────────────────────────────────────────

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith(".csv")) {
      toast.error("Please upload a CSV file");
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      toast.error("File size must be under 5 MB");
      return;
    }

    setFile(selectedFile);
    setParseErrors([]);
    setParseWarnings([]);
    setIsProcessing(true);

    try {
      const result = await parseCSVMCQ(selectedFile);

      setParseErrors(result.errors);
      setParseWarnings(result.warnings);

      if (!result.success) {
        toast.error(result.errors[0] || "Failed to parse CSV");
        setIsProcessing(false);
        return;
      }

      setQuestions(result.questions);
      setStep("review");
      toast.success(`Successfully parsed ${result.questions.length} questions`);
    } catch (err: any) {
      setParseErrors([err.message || "Failed to parse CSV file"]);
      toast.error("Failed to parse CSV file");
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleFileSelect(droppedFile);
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // ── Save Questions ───────────────────────────────────────────────────────

  const handleSave = async () => {
    if (questions.length === 0) {
      toast.error("No questions to save");
      return;
    }

    setIsSaving(true);
    setSaveProgress({ saved: 0, total: questions.length });
    setStep("saving");

    let savedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const { success } = await addQuestion({
        exam_id: examId,
        question_text: q.question_text,
        marks: q.marks,
        explanation: q.explanation || undefined,
        position: i,
        options: q.options.map((opt, idx) => ({
          option_text: opt.option_text,
          is_correct: opt.is_correct,
          position: idx,
        })),
      });

      if (success) {
        savedCount++;
      } else {
        failedCount++;
      }
      setSaveProgress({ saved: savedCount, total: questions.length });
    }

    setIsSaving(false);

    if (failedCount === 0) {
      toast.success(`${savedCount} questions added to exam`);
      onQuestionsAdded();
      handleReset();
    } else {
      toast.error(
        `${failedCount} questions failed to save. ${savedCount} saved successfully.`
      );
      if (savedCount > 0) onQuestionsAdded();
    }
  };

  // ── Download Template ────────────────────────────────────────────────────

  const handleDownloadTemplate = () => {
    const csv = generateCSVTemplate();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "mcq_template.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Template downloaded");
  };

  // ── Reset ────────────────────────────────────────────────────────────────

  const handleReset = () => {
    setStep("upload");
    setFile(null);
    setQuestions([]);
    setParseErrors([]);
    setParseWarnings([]);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Card className="border-dashed border-2 border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Bulk MCQ Upload (CSV)
          </CardTitle>
          {step !== "upload" && (
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <X className="h-3 w-3 mr-1" /> Close
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {/* Errors */}
        {parseErrors.length > 0 && (
          <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm space-y-1">
            <div className="font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Errors:
            </div>
            {parseErrors.map((err, idx) => (
              <p key={idx} className="text-xs ml-6">
                • {err}
              </p>
            ))}
          </div>
        )}

        {/* Warnings */}
        {parseWarnings.length > 0 && (
          <div className="mb-4 p-3 rounded-md bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 text-yellow-800 dark:text-yellow-200 text-sm space-y-1">
            <div className="font-medium flex items-center gap-2">
              <Info className="h-4 w-4" />
              Warnings ({parseWarnings.length}):
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium">
                Show details
              </summary>
              <div className="mt-2 space-y-1 ml-6">
                {parseWarnings.slice(0, 5).map((warn, idx) => (
                  <p key={idx} className="text-xs">
                    • {warn}
                  </p>
                ))}
                {parseWarnings.length > 5 && (
                  <p className="text-xs text-yellow-600 dark:text-yellow-400 italic">
                    + {parseWarnings.length - 5} more warnings
                  </p>
                )}
              </div>
            </details>
          </div>
        )}

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div className="space-y-4">
            <div
              ref={dropRef}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "flex flex-col items-center justify-center gap-3 p-8 rounded-lg border-2 border-dashed cursor-pointer transition-colors",
                isProcessing
                  ? "border-primary/50 bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />

              {isProcessing ? (
                <>
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">
                    Parsing CSV file...
                  </p>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">
                      Drop a CSV file here or click to upload
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      CSV files up to 5 MB
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadTemplate}
                className="flex-1"
              >
                <Download className="h-3 w-3 mr-2" />
                Download Template
              </Button>
            </div>

            <div className="p-3 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 text-blue-800 dark:text-blue-200 text-xs space-y-2">
              <p className="font-medium">CSV Format:</p>
              <p>
                question_text, option_1, option_2, option_3, option_4,
                correct_option, marks, explanation
              </p>
              <p className="italic">
                Example: "What is 2+2?", "3", "4", "5", "6", 2, 1, "The answer
                is 4"
              </p>
            </div>
          </div>
        )}

        {/* Step 2: Review */}
        {step === "review" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge variant="secondary">
                {questions.length} questions ready to save
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStep("upload")}
              >
                <ChevronLeft className="h-3 w-3 mr-1" /> Choose Different File
              </Button>
            </div>

            <div className="max-h-96 overflow-y-auto space-y-2 border rounded-lg p-3 bg-muted/50">
              {questions.map((q, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded-md border bg-background text-xs space-y-1"
                >
                  <p className="font-medium">
                    Q{idx + 1}: {q.question_text.substring(0, 60)}
                    {q.question_text.length > 60 ? "..." : ""}
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {q.options.map((opt, oidx) => (
                      <p
                        key={oidx}
                        className={cn(
                          "text-xs p-1 rounded",
                          opt.is_correct
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 font-medium"
                            : "text-muted-foreground"
                        )}
                      >
                        {String.fromCharCode(65 + oidx)}: {opt.option_text.substring(0, 40)}
                      </p>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {q.marks} marks
                    {q.explanation && ` • Has explanation`}
                  </p>
                </div>
              ))}
            </div>

            <Button
              className="w-full"
              onClick={handleSave}
              disabled={isSaving || questions.length === 0}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Save All Questions
            </Button>
          </div>
        )}

        {/* Step 3: Saving */}
        {step === "saving" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                Saving questions...
              </span>
              <Badge>
                {saveProgress.saved} / {saveProgress.total}
              </Badge>
            </div>

            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{
                  width: `${(saveProgress.saved / saveProgress.total) * 100}%`,
                }}
              />
            </div>

            {isSaving && (
              <p className="text-xs text-muted-foreground text-center">
                <Loader2 className="h-3 w-3 inline mr-1 animate-spin" />
                Please wait...
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
