import React, { useState } from "react";
import { Plus, Trash, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { ExamQuestion } from "../../types";
import { toast } from "sonner";
import { addQuestion, deleteQuestion } from "../../services/exam.service";
import { cn } from "@/lib/utils";

interface QuestionManagerProps {
  examId: string;
  questions: ExamQuestion[];
  onRefresh: () => void;
}

export function QuestionManager({ examId, questions, onRefresh }: QuestionManagerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newQuestion, setNewQuestion] = useState({
    question_text: "",
    marks: 1,
    explanation: "",
    options: [
      { option_text: "", is_correct: false, position: 0 },
      { option_text: "", is_correct: false, position: 1 },
      { option_text: "", is_correct: false, position: 2 },
      { option_text: "", is_correct: false, position: 3 },
    ],
  });

  const handleAddQuestion = async () => {
    if (!newQuestion.question_text) {
      toast.error("Question text is required");
      return;
    }
    if (!newQuestion.options.some(o => o.is_correct)) {
      toast.error("Please select at least one correct option");
      return;
    }
    if (newQuestion.options.some(o => !o.option_text)) {
      toast.error("All options must have text");
      return;
    }

    const { success } = await addQuestion({
      exam_id: examId,
      ...newQuestion,
      position: questions.length,
    });

    if (success) {
      toast.success("Question added successfully");
      setIsAdding(false);
      setNewQuestion({
        question_text: "",
        marks: 1,
        explanation: "",
        options: [
          { option_text: "", is_correct: false, position: 0 },
          { option_text: "", is_correct: false, position: 1 },
          { option_text: "", is_correct: false, position: 2 },
          { option_text: "", is_correct: false, position: 3 },
        ],
      });
      onRefresh();
    } else {
      toast.error("Failed to add question");
    }
  };

  const handleDeleteQuestion = async (id: string) => {
    if (!confirm("Delete this question?")) return;
    const { success } = await deleteQuestion(id);
    if (success) {
      toast.success("Question deleted");
      onRefresh();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-foreground">Questions ({questions.length})</h3>
        {!isAdding && (
          <Button onClick={() => setIsAdding(true)} size="sm">
            <Plus className="mr-2 h-4 w-4" /> Add Question
          </Button>
        )}
      </div>

      {isAdding && (
        <Card className="border-primary/50 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">New MCQ Question</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Question Text</Label>
              <Textarea
                placeholder="Enter your question here..."
                value={newQuestion.question_text}
                onChange={(e) => setNewQuestion({ ...newQuestion, question_text: e.target.value })}
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Marks</Label>
                <Input
                  type="number"
                  value={newQuestion.marks}
                  onChange={(e) => setNewQuestion({ ...newQuestion, marks: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label>Options (Check the correct one)</Label>
              {newQuestion.options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <Checkbox
                    checked={opt.is_correct}
                    onCheckedChange={(checked) => {
                      const newOptions = [...newQuestion.options];
                      if (checked) {
                        newOptions.forEach((o, i) => o.is_correct = i === idx);
                      } else {
                        newOptions[idx].is_correct = false;
                      }
                      setNewQuestion({ ...newQuestion, options: newOptions });
                    }}
                  />
                  <Input
                    placeholder={`Option ${idx + 1}`}
                    value={opt.option_text}
                    onChange={(e) => {
                      const newOptions = [...newQuestion.options];
                      newOptions[idx].option_text = e.target.value;
                      setNewQuestion({ ...newQuestion, options: newOptions });
                    }}
                  />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label>Explanation (Optional)</Label>
              <Textarea
                placeholder="Why is this answer correct?"
                value={newQuestion.explanation}
                onChange={(e) => setNewQuestion({ ...newQuestion, explanation: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setIsAdding(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleAddQuestion}>
                Save Question
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {questions.map((q, qIdx) => (
          <Card key={q.id}>
            <CardContent className="pt-6">
              <div className="flex justify-between items-start gap-4">
                <div className="flex-1 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                      {qIdx + 1}
                    </span>
                    <p className="font-medium text-foreground">{q.question_text}</p>
                    <span className="text-xs font-medium text-muted-foreground ml-auto bg-muted px-2 py-0.5 rounded">
                      {q.marks} Marks
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 ml-8">
                    {q.options?.map((opt) => (
                      <div
                        key={opt.id}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-md border text-sm",
                          opt.is_correct ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950/30" : "border-border"
                        )}
                      >
                        {opt.is_correct ? <Check className="h-4 w-4" /> : <div className="h-4 w-4 border rounded-full" />}
                        {opt.option_text}
                      </div>
                    ))}
                  </div>

                  {q.explanation && (
                    <div className="ml-8 p-3 rounded-md bg-muted/50 text-xs italic text-muted-foreground">
                      <strong>Explanation:</strong> {q.explanation}
                    </div>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => handleDeleteQuestion(q.id)}>
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
