import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { examSchema, type ExamFormData } from "../../validations/exam.schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Resolver } from "react-hook-form";
import { ProctoringSettingsCard } from "./ProctoringSettingsCard";

interface ExamFormProps {
  initialData?: Partial<ExamFormData>;
  onSubmit: (data: ExamFormData) => void;
  isLoading?: boolean;
}

const formatDateForInput = (dateString?: string | null) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";

  // Format to YYYY-MM-DDTHH:mm
  const pad = (num: number) => num.toString().padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export function ExamForm({ initialData, onSubmit, isLoading }: ExamFormProps) {
  const form = useForm<ExamFormData>({
    resolver: zodResolver(examSchema) as Resolver<ExamFormData>,
    defaultValues: {
      title: "",
      description: "",
      instructions: "",
      duration_mins: 60,
      time_per_question_seconds: null,
      total_marks: 100,
      passing_marks: 35,
      status: "draft",
      auto_submit: true,
      negative_marking: false,
      negative_marks_per_question: 0,
      randomize_questions: false,
      exam_type: "mcq" as const,
      enable_tab_detection: false,
      enable_camera_mic: false,
      enable_deterrent_ui: false,
      enable_screen_capture: false,
      ...initialData,
      start_time: formatDateForInput(initialData?.start_time),
      end_time: formatDateForInput(initialData?.end_time),
    } as ExamFormData,
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Test Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Mid-term Science Exam" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Short description of the test" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="instructions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Instructions</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Instructions for students (e.g. Do not switch tabs)"
                          className="min-h-[100px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Schedule & Duration</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="duration_mins"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Duration (Minutes)</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormDescription>Total time for the entire exam</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="time_per_question_seconds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Time Per Question (Seconds)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Leave empty for no per-question limit"
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(e.target.value ? Number(e.target.value) : null)
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        Auto-advances to next question when time expires. Leave empty to use only
                        total duration.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="published">Published</SelectItem>
                          <SelectItem value="archived">Archived</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="relative group">
                  <FormField
                    control={form.control}
                    name="start_time"
                    render={({ field }) => {
                      const isPublished = form.watch("status") === "published";
                      return (
                        <FormItem>
                          <FormLabel>
                            Start Time
                            {isPublished && (
                              <span className="ml-2 text-xs text-amber-600 font-normal">
                                (Locked)
                              </span>
                            )}
                          </FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type="datetime-local"
                                {...field}
                                value={field.value || ""}
                                disabled={isPublished}
                                className={isPublished ? "bg-muted cursor-not-allowed" : ""}
                              />
                              {field.value && !isPublished && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="absolute right-8 top-1 h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => field.onChange(null)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                </div>
                <div className="relative group">
                  <FormField
                    control={form.control}
                    name="end_time"
                    render={({ field }) => {
                      const isPublished = form.watch("status") === "published";
                      return (
                        <FormItem>
                          <FormLabel>
                            End Time
                            {isPublished && (
                              <span className="ml-2 text-xs text-amber-600 font-normal">
                                (Locked)
                              </span>
                            )}
                          </FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                type="datetime-local"
                                {...field}
                                value={field.value || ""}
                                disabled={isPublished}
                                className={isPublished ? "bg-muted cursor-not-allowed" : ""}
                              />
                              {field.value && !isPublished && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="absolute right-8 top-1 h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => field.onChange(null)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Grading & Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="exam_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Exam Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? "mcq"}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select exam type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="mcq">MCQ (Multiple Choice)</SelectItem>
                          <SelectItem value="coding">Coding (Programming)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        MCQ tests are multiple-choice; Coding tests require students to write code.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="total_marks"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Total Marks</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="passing_marks"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Passing Marks</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-4 pt-4">
                  <FormField
                    control={form.control}
                    name="auto_submit"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>Auto-submit on timeout</FormLabel>
                          <FormDescription>
                            Automatically submit test when time runs out
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="randomize_questions"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>Randomize Questions</FormLabel>
                          <FormDescription>Shuffle questions for each student</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="negative_marking"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <FormLabel>Negative Marking</FormLabel>
                          <FormDescription>Deduct marks for wrong answers</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  {form.watch("negative_marking") && (
                    <FormField
                      control={form.control}
                      name="negative_marks_per_question"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Negative Marks per Question</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.25" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </CardContent>
            </Card>

            <ProctoringSettingsCard form={form} />

            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" onClick={() => window.history.back()}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Saving..." : "Save Test"}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </Form>
  );
}
