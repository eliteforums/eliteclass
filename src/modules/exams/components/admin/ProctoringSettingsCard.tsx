import React from "react";
import type { UseFormReturn } from "react-hook-form";
import { FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, Camera, Shield, Monitor } from "lucide-react";
import type { ExamFormData } from "../../validations/exam.schema";

interface ProctoringSettingsCardProps {
  form: UseFormReturn<ExamFormData>;
}

export function ProctoringSettingsCard({ form }: ProctoringSettingsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Proctoring Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormField
          control={form.control}
          name="enable_tab_detection"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <div className="space-y-0.5">
                  <FormLabel>Tab Switch Detection</FormLabel>
                  <FormDescription>
                    Monitor and log when students switch tabs during the exam
                  </FormDescription>
                </div>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="enable_camera_mic"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <Camera className="h-4 w-4 text-muted-foreground" />
                <div className="space-y-0.5">
                  <FormLabel>Camera & Microphone</FormLabel>
                  <FormDescription>
                    Require camera and microphone access as a deterrent (no recording)
                  </FormDescription>
                </div>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="enable_deterrent_ui"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <div className="space-y-0.5">
                  <FormLabel>Proctoring Overlay</FormLabel>
                  <FormDescription>
                    Show a visual "recording active" indicator to students
                  </FormDescription>
                </div>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="enable_screen_capture"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <Monitor className="h-4 w-4 text-muted-foreground" />
                <div className="space-y-0.5">
                  <FormLabel>Screen Capture</FormLabel>
                  <FormDescription>
                    Capture 1–2 screenshots of the student's screen during the exam (requires
                    student consent)
                  </FormDescription>
                </div>
              </div>
              <FormControl>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </FormControl>
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  );
}
