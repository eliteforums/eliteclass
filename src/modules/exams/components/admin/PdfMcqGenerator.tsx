import React, { useState, useCallback, useRef } from "react";
import {
  Upload,
  FileText,
  Sparkles,
  Loader2,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { extractTextFromPdf } from "../../services/pdfExtractor";
import { generateMCQsFromText } from "../../services/mcqGenerator";
import { addQuestion } from "../../services/exam.service";
import { cn } from "@/lib/utils";

interface PdfMcqGeneratorProps {
  examId: string;
  onQuestionsAdded: () => void;
}

interface GeneratedQuestion {
  id: string;
  question_text: string;
  options: { option_text: string; is_correct: boolean }[];
  marks: number;
  explanation: string;
  selected: boolean;
}

type Step = "upload" | "configure" | "review" | "saving";
type Mode = "extract" | "generate";
type Difficulty = "easy" | "medium" | "hard";

export function PdfMcqGenerator({ examId, onQuestionsAdded }: PdfMcqGeneratorProps) {
  // Step state
  const [step, setStep] = useState<Step>("upload");

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState("");
  const [extractionProgress, setExtractionProgress] = useState({ page: 0, total: 0 });
  const [isExtracting, setIsExtracting] = useState(false);

  // Configure state
  const [mode, setMode] = useState<Mode>("generate");
  const [questionCount, setQuestionCount] = useState(10);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [isGenerating, setIsGenerating] = useState(false);

  // Review state
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [cardIndex, setCardIndex] = useState(0);
  const [viewMode, setViewMode] = useState<"list" | "card">("list");

  // Saving state
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState({ saved: 0, total: 0 });

  // Error state
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // ── File Upload ──────────────────────────────────────────────────────────

  const handleFileSelect = useCallback(async (selectedFile: File) => {
    if (!selectedFile.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Please upload a PDF file");
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      toast.error("File size must be under 10 MB");
      return;
    }

    setFile(selectedFile);
    setError(null);
    setIsExtracting(true);

    try {
      const text = await extractTextFromPdf(selectedFile, (page, total) => {
        setExtractionProgress({ page, total });
      });

      if (!text || text.length < 50) {
        setError("No extractable text found in this PDF. Please try a different file.");
        setIsExtracting(false);
        return;
      }

      // Warn if text is very large (will be truncated to 5000 chars for API)
      if (text.length > 50000) {
        toast.warning("This PDF is very large. Only the first ~5000 characters will be processed for best results.");
      }

      setExtractedText(text);
      setIsExtracting(false);
      setStep("configure");
    } catch (err: any) {
      setError(err.message || "Failed to extract text from PDF");
      setIsExtracting(false);
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

  // ── Generation ───────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const result = await generateMCQsFromText(extractedText, {
        mode,
        count: questionCount,
        difficulty,
      });

      if (result.length === 0) {
        setError("No questions could be generated from this content. Try a different PDF or mode.");
        setIsGenerating(false);
        return;
      }

      const questionsWithIds: GeneratedQuestion[] = result.map((q, idx) => ({
        ...q,
        id: `gen-${Date.now()}-${idx}`,
        selected: true,
      }));

      setQuestions(questionsWithIds);
      setIsGenerating(false);
      setStep("review");
    } catch (err: any) {
      setError(err.message || "Failed to generate questions");
      setIsGenerating(false);
    }
  };

  // ── Review Actions ───────────────────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, selected: !q.selected } : q))
    );
  };

  const toggleSelectAll = () => {
    const allSelected = questions.every((q) => q.selected);
    setQuestions((prev) => prev.map((q) => ({ ...q, selected: !allSelected })));
  };

  const removeQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const updateQuestion = (id: string, updates: Partial<GeneratedQuestion>) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, ...updates } : q))
    );
  };

  const selectedCount = questions.filter((q) => q.selected).length;

  // ── Save Questions ───────────────────────────────────────────────────────

  const handleSave = async () => {
    const toSave = questions.filter((q) => q.selected);
    if (toSave.length === 0) {
      toast.error("No questions selected to save");
      return;
    }

    setIsSaving(true);
    setSaveProgress({ saved: 0, total: toSave.length });
    setStep("saving");

    let savedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < toSave.length; i++) {
      const q = toSave[i];
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
      setSaveProgress({ saved: savedCount, total: toSave.length });
    }

    setIsSaving(false);

    if (failedCount === 0) {
      toast.success(`${savedCount} questions added to exam`);
      onQuestionsAdded();
    } else {
      toast.error(`${failedCount} questions failed to save. ${savedCount} saved successfully.`);
      if (savedCount > 0) onQuestionsAdded();
    }
  };

  // ── Reset ────────────────────────────────────────────────────────────────

  const handleReset = () => {
    setStep("upload");
    setFile(null);
    setExtractedText("");
    setExtractionProgress({ page: 0, total: 0 });
    setQuestions([]);
    setError(null);
    setEditingId(null);
    setCardIndex(0);
  };

  // ── Render Steps ─────────────────────────────────────────────────────────

  return (
    <Card className="border-dashed border-2 border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Question Generator
          </CardTitle>
          {step !== "upload" && (
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <RefreshCw className="h-3 w-3 mr-1" /> Start Over
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm flex items-start gap-2">
            <X className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p>{error}</p>
              {step === "configure" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={handleGenerate}
                >
                  <RefreshCw className="h-3 w-3 mr-1" /> Retry
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Step 1: Upload */}
        {step === "upload" && (
          <div
            ref={dropRef}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex flex-col items-center justify-center gap-3 p-8 rounded-lg border-2 border-dashed cursor-pointer transition-colors",
              isExtracting
                ? "border-primary/50 bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
            />

            {isExtracting ? (
              <>
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">
                  Extracting text... Page {extractionProgress.page} of{" "}
                  {extractionProgress.total}
                </p>
                <div className="w-48 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{
                      width: `${extractionProgress.total > 0 ? (extractionProgress.page / extractionProgress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">
                    Drop a PDF here or click to upload
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    PDF files up to 10 MB
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* Step 2: Configure */}
        {step === "configure" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50">
              <FileText className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium truncate">{file?.name}</span>
              <Badge variant="secondary" className="ml-auto text-xs">
                {Math.round(extractedText.length / 1000)}k chars
              </Badge>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-medium">Mode</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={mode === "extract" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMode("extract")}
                  className="justify-start"
                >
                  <FileText className="h-3 w-3 mr-2" />
                  Extract existing MCQs
                </Button>
                <Button
                  variant={mode === "generate" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setMode("generate")}
                  className="justify-start"
                >
                  <Sparkles className="h-3 w-3 mr-2" />
                  Generate new MCQs
                </Button>
              </div>
            </div>

            {mode === "generate" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Number of Questions</Label>
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={questionCount}
                    onChange={(e) => setQuestionCount(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Difficulty</Label>
                  <div className="flex gap-1">
                    {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
                      <Button
                        key={d}
                        variant={difficulty === d ? "default" : "outline"}
                        size="sm"
                        className="flex-1 capitalize text-xs"
                        onClick={() => setDifficulty(d)}
                      >
                        {d}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {mode === "extract" ? "Extracting..." : "Generating..."}
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  {mode === "extract" ? "Extract Questions" : "Generate Questions"}
                </>
              )}
            </Button>
          </div>
        )}

        {/* Step 3: Review */}
        {step === "review" && (
          <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">
                  {questions.length} questions
                </Badge>
                <Badge variant="outline">
                  {selectedCount} selected
                </Badge>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                  className="text-xs h-7 px-2"
                >
                  List
                </Button>
                <Button
                  variant={viewMode === "card" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("card")}
                  className="text-xs h-7 px-2"
                >
                  Card
                </Button>
              </div>
            </div>

            {/* List View */}
            {viewMode === "list" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 pb-2 border-b">
                  <Checkbox
                    checked={questions.length > 0 && questions.every((q) => q.selected)}
                    onCheckedChange={toggleSelectAll}
                  />
                  <span className="text-xs text-muted-foreground">Select All</span>
                </div>

                <div className="max-h-[400px] overflow-y-auto space-y-2">
                  {questions.map((q, idx) => (
                    <div
                      key={q.id}
                      className={cn(
                        "flex items-start gap-2 p-3 rounded-md border transition-colors",
                        q.selected ? "border-primary/30 bg-primary/5" : "border-border"
                      )}
                    >
                      <Checkbox
                        checked={q.selected}
                        onCheckedChange={() => toggleSelect(q.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        {editingId === q.id ? (
                          <QuestionEditor
                            question={q}
                            onSave={(updates) => {
                              updateQuestion(q.id, updates);
                              setEditingId(null);
                            }}
                            onCancel={() => setEditingId(null)}
                          />
                        ) : (
                          <div
                            className="cursor-pointer"
                            onClick={() => setEditingId(q.id)}
                          >
                            <p className="text-sm font-medium line-clamp-2">
                              {idx + 1}. {q.question_text}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-muted-foreground">
                                {q.options.length} options
                              </span>
                              <span className="text-xs text-muted-foreground">
                                • {q.marks} mark{q.marks !== 1 ? "s" : ""}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive shrink-0"
                        onClick={() => removeQuestion(q.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Card View */}
            {viewMode === "card" && questions.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={cardIndex === 0}
                    onClick={() => setCardIndex((i) => i - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {cardIndex + 1} / {questions.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={cardIndex === questions.length - 1}
                    onClick={() => setCardIndex((i) => i + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                <QuestionCard
                  question={questions[cardIndex]}
                  index={cardIndex}
                  onUpdate={(updates) =>
                    updateQuestion(questions[cardIndex].id, updates)
                  }
                  onToggleSelect={() => toggleSelect(questions[cardIndex].id)}
                  onRemove={() => {
                    removeQuestion(questions[cardIndex].id);
                    if (cardIndex >= questions.length - 1 && cardIndex > 0) {
                      setCardIndex(cardIndex - 1);
                    }
                  }}
                />
              </div>
            )}

            {/* Save Button */}
            <div className="flex gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setStep("configure")}>
                <ChevronLeft className="h-3 w-3 mr-1" /> Back
              </Button>
              <Button
                className="flex-1"
                onClick={handleSave}
                disabled={selectedCount === 0}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Add {selectedCount} Question{selectedCount !== 1 ? "s" : ""} to Exam
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Saving */}
        {step === "saving" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">
              Saving questions... {saveProgress.saved} / {saveProgress.total}
            </p>
            <div className="w-48 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{
                  width: `${saveProgress.total > 0 ? (saveProgress.saved / saveProgress.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function QuestionEditor({
  question,
  onSave,
  onCancel,
}: {
  question: GeneratedQuestion;
  onSave: (updates: Partial<GeneratedQuestion>) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(question.question_text);
  const [marks, setMarks] = useState(question.marks);
  const [explanation, setExplanation] = useState(question.explanation);
  const [options, setOptions] = useState(question.options);

  return (
    <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="text-sm min-h-[60px]"
        placeholder="Question text"
      />

      <div className="space-y-2">
        {options.map((opt, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Checkbox
              checked={opt.is_correct}
              onCheckedChange={(checked) => {
                const newOpts = options.map((o, i) => ({
                  ...o,
                  is_correct: i === idx ? !!checked : false,
                }));
                setOptions(newOpts);
              }}
            />
            <Input
              value={opt.option_text}
              onChange={(e) => {
                const newOpts = [...options];
                newOpts[idx] = { ...newOpts[idx], option_text: e.target.value };
                setOptions(newOpts);
              }}
              className="text-xs h-8"
              placeholder={`Option ${idx + 1}`}
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Marks</Label>
          <Input
            type="number"
            value={marks}
            onChange={(e) => setMarks(Number(e.target.value))}
            className="h-8 text-xs"
          />
        </div>
      </div>

      <div>
        <Label className="text-xs">Explanation</Label>
        <Textarea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          className="text-xs min-h-[40px]"
          placeholder="Optional explanation"
        />
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          className="text-xs h-7"
          onClick={() =>
            onSave({
              question_text: text,
              marks,
              explanation,
              options,
            })
          }
        >
          <Check className="h-3 w-3 mr-1" /> Save
        </Button>
        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function QuestionCard({
  question,
  index,
  onUpdate,
  onToggleSelect,
  onRemove,
}: {
  question: GeneratedQuestion;
  index: number;
  onUpdate: (updates: Partial<GeneratedQuestion>) => void;
  onToggleSelect: () => void;
  onRemove: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <Card className="border-primary/30">
        <CardContent className="pt-4">
          <QuestionEditor
            question={question}
            onSave={(updates) => {
              onUpdate(updates);
              setIsEditing(false);
            }}
            onCancel={() => setIsEditing(false)}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("transition-colors", question.selected ? "border-primary/30" : "")}>
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium">
            {index + 1}. {question.question_text}
          </p>
          <Badge variant="outline" className="shrink-0 text-xs">
            {question.marks} mark{question.marks !== 1 ? "s" : ""}
          </Badge>
        </div>

        <div className="space-y-1.5">
          {question.options.map((opt, idx) => (
            <div
              key={idx}
              className={cn(
                "flex items-center gap-2 p-2 rounded text-xs border",
                opt.is_correct
                  ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950/30"
                  : "border-border"
              )}
            >
              {opt.is_correct ? (
                <Check className="h-3 w-3 shrink-0" />
              ) : (
                <div className="h-3 w-3 border rounded-full shrink-0" />
              )}
              {opt.option_text}
            </div>
          ))}
        </div>

        {question.explanation && (
          <p className="text-xs text-muted-foreground italic p-2 bg-muted/50 rounded">
            <strong>Explanation:</strong> {question.explanation}
          </p>
        )}

        <div className="flex items-center gap-2 pt-2 border-t">
          <Button
            variant={question.selected ? "default" : "outline"}
            size="sm"
            className="text-xs h-7"
            onClick={onToggleSelect}
          >
            {question.selected ? (
              <>
                <Check className="h-3 w-3 mr-1" /> Selected
              </>
            ) : (
              "Select"
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7"
            onClick={() => setIsEditing(true)}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7 text-destructive ml-auto"
            onClick={onRemove}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
