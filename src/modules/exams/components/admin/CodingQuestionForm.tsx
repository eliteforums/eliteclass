import React, { useState } from "react";
import { Plus, Trash2, Eye, EyeOff, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { addCodingQuestion } from "../../services/exam.service";

interface TestCaseInput {
  input: string;
  expected_output: string;
  is_hidden: boolean;
}

interface ExampleInput {
  input: string;
  output: string;
  explanation: string;
}

interface CodingQuestionFormProps {
  examId: string;
  position: number;
  onSuccess: () => void;
  onCancel: () => void;
}

const DEFAULT_STARTERS: Record<string, string> = {
  python: "# Write your solution here\n\ndef solution():\n    pass\n",
  javascript: "// Write your solution here\n\nfunction solution() {\n  \n}\n",
  java: "// Write your solution here\nimport java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        // your code\n    }\n}\n",
  cpp: "// Write your solution here\n#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // your code\n    return 0;\n}\n",
  c: "// Write your solution here\n#include <stdio.h>\n\nint main() {\n    // your code\n    return 0;\n}\n",
};

export function CodingQuestionForm({
  examId,
  position,
  onSuccess,
  onCancel,
}: CodingQuestionFormProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [problemStatement, setProblemStatement] = useState("");
  const [marks, setMarks] = useState(10);
  const [constraints, setConstraints] = useState("");
  const [timeLimitSeconds, setTimeLimitSeconds] = useState(5);
  const [examples, setExamples] = useState<ExampleInput[]>([
    { input: "", output: "", explanation: "" },
  ]);
  const [testCases, setTestCases] = useState<TestCaseInput[]>([
    { input: "", expected_output: "", is_hidden: false },
    { input: "", expected_output: "", is_hidden: true },
  ]);

  // --- Examples helpers ---
  const addExample = () => setExamples([...examples, { input: "", output: "", explanation: "" }]);
  const removeExample = (i: number) => setExamples(examples.filter((_, idx) => idx !== i));
  const updateExample = (i: number, field: keyof ExampleInput, value: string) => {
    const next = [...examples];
    next[i] = { ...next[i], [field]: value };
    setExamples(next);
  };

  // --- Test case helpers ---
  const addTestCase = (hidden: boolean) =>
    setTestCases([...testCases, { input: "", expected_output: "", is_hidden: hidden }]);
  const removeTestCase = (i: number) => setTestCases(testCases.filter((_, idx) => idx !== i));
  const updateTestCase = (i: number, field: keyof TestCaseInput, value: string | boolean) => {
    const next = [...testCases];
    next[i] = { ...next[i], [field]: value } as TestCaseInput;
    setTestCases(next);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Question title is required");
      return;
    }
    if (!problemStatement.trim()) {
      toast.error("Problem statement is required");
      return;
    }
    if (testCases.length === 0) {
      toast.error("At least one test case is required");
      return;
    }
    if (testCases.some((tc) => !tc.input.trim() && !tc.expected_output.trim())) {
      toast.error("All test cases must have input and expected output");
      return;
    }

    setIsSaving(true);
    const { success, error } = await addCodingQuestion({
      exam_id: examId,
      question_text: title,
      problem_statement: problemStatement,
      marks,
      position,
      constraints_text: constraints || undefined,
      examples: examples
        .filter((e) => e.input || e.output)
        .map((e) => ({
          input: e.input,
          output: e.output,
          explanation: e.explanation || undefined,
        })),
      test_cases: testCases.map((tc) => ({
        input: tc.input,
        expected_output: tc.expected_output,
        is_hidden: tc.is_hidden,
      })),
      starter_code: DEFAULT_STARTERS,
      time_limit_seconds: timeLimitSeconds,
      memory_limit_mb: 256,
    });
    setIsSaving(false);

    if (success) {
      toast.success("Coding question added!");
      onSuccess();
    } else {
      toast.error(error || "Failed to add question");
    }
  };

  return (
    <Card className="border-violet-200 shadow-md dark:border-violet-800">
      <CardHeader className="pb-3 bg-violet-50 dark:bg-violet-950/30">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Code2 className="h-4 w-4 text-violet-600" />
          New Coding Problem
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 pt-4">
        {/* Title + Marks */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <div className="sm:col-span-3 space-y-1">
            <Label>Problem Title</Label>
            <Input
              placeholder="e.g. Two Sum, Fibonacci Series, ..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Marks</Label>
            <Input
              type="number"
              min={1}
              value={marks}
              onChange={(e) => setMarks(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Problem Statement */}
        <div className="space-y-1">
          <Label>Problem Statement</Label>
          <Textarea
            placeholder="Describe the problem clearly. Include what input is given, what output is expected, and any edge cases..."
            value={problemStatement}
            onChange={(e) => setProblemStatement(e.target.value)}
            className="min-h-[120px]"
          />
        </div>

        {/* Constraints + Time Limit */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2 space-y-1">
            <Label>
              Constraints <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              placeholder="e.g. 1 ≤ n ≤ 10^5, input is a single integer per line, ..."
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              className="min-h-[60px]"
            />
          </div>
          <div className="space-y-1">
            <Label>Time Limit (seconds)</Label>
            <Input
              type="number"
              min={1}
              max={30}
              value={timeLimitSeconds}
              onChange={(e) => setTimeLimitSeconds(Number(e.target.value))}
            />
          </div>
        </div>

        {/* Examples */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>
              Examples{" "}
              <span className="text-muted-foreground font-normal text-xs">(shown to students)</span>
            </Label>
            <Button type="button" variant="outline" size="sm" onClick={addExample}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Example
            </Button>
          </div>
          {examples.map((ex, i) => (
            <div
              key={i}
              className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg border bg-muted/20"
            >
              <div className="space-y-1">
                <Label className="text-xs">Input</Label>
                <Textarea
                  value={ex.input}
                  onChange={(e) => updateExample(i, "input", e.target.value)}
                  className="font-mono text-xs min-h-[60px]"
                  placeholder="5"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Output</Label>
                <Textarea
                  value={ex.output}
                  onChange={(e) => updateExample(i, "output", e.target.value)}
                  className="font-mono text-xs min-h-[60px]"
                  placeholder="120"
                />
              </div>
              <div className="sm:col-span-2 flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">
                    Explanation{" "}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    value={ex.explanation}
                    onChange={(e) => updateExample(i, "explanation", e.target.value)}
                    placeholder="5! = 5×4×3×2×1 = 120"
                    className="text-xs"
                  />
                </div>
                {examples.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive h-8 w-8"
                    onClick={() => removeExample(i)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Test Cases */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>
              Test Cases{" "}
              <span className="text-muted-foreground font-normal text-xs">
                (used for auto-scoring)
              </span>
            </Label>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => addTestCase(false)}>
                <Eye className="h-3.5 w-3.5 mr-1" /> Visible
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => addTestCase(true)}>
                <EyeOff className="h-3.5 w-3.5 mr-1" /> Hidden
              </Button>
            </div>
          </div>
          {testCases.map((tc, i) => (
            <div
              key={i}
              className={`grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg border ${
                tc.is_hidden
                  ? "border-orange-200 bg-orange-50/30 dark:border-orange-800 dark:bg-orange-950/20"
                  : "bg-muted/20"
              }`}
            >
              <div className="sm:col-span-2 flex items-center justify-between">
                <Badge
                  variant={tc.is_hidden ? "outline" : "secondary"}
                  className={tc.is_hidden ? "text-orange-600 border-orange-300" : ""}
                >
                  {tc.is_hidden ? (
                    <>
                      <EyeOff className="h-3 w-3 mr-1" />
                      Hidden
                    </>
                  ) : (
                    <>
                      <Eye className="h-3 w-3 mr-1" />
                      Visible
                    </>
                  )}
                  &nbsp;· TC {i + 1}
                </Badge>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Hidden</Label>
                  <Switch
                    checked={tc.is_hidden}
                    onCheckedChange={(v) => updateTestCase(i, "is_hidden", v)}
                  />
                  {testCases.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive h-7 w-7"
                      onClick={() => removeTestCase(i)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Input (stdin)</Label>
                <Textarea
                  value={tc.input}
                  onChange={(e) => updateTestCase(i, "input", e.target.value)}
                  className="font-mono text-xs min-h-[60px]"
                  placeholder="5"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Expected Output</Label>
                <Textarea
                  value={tc.expected_output}
                  onChange={(e) => updateTestCase(i, "expected_output", e.target.value)}
                  className="font-mono text-xs min-h-[60px]"
                  placeholder="120"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className="bg-violet-600 hover:bg-violet-700"
          >
            {isSaving ? "Saving..." : "Save Coding Problem"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
