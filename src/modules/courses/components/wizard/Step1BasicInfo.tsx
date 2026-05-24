// ---------------------------------------------------------------------------
// EduOS — LMS Wizard Step 1: Basic Course Information
//
// Full react-hook-form + zod form for all course metadata.
// Two-column desktop layout, dynamic tag inputs, radio groups.
// ---------------------------------------------------------------------------

import { useState, useEffect, useMemo, useRef, type KeyboardEvent, type ReactNode } from "react";
import { useForm, Controller, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2, X, Plus, BookOpen, Globe, Clock, Tag, School } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import {
  createCourseSchema,
  type CreateCourseSchema,
} from "@/modules/courses/validations/course.schema";
import type { CreateCoursePayload, LmsCategory, Course } from "@/types";
import { getCoursesByInstitute } from "@/services/course.service";
import { useAuthStore } from "@/store/authStore";

// ── Constants ─────────────────────────────────────────────────────────────────

const LANGUAGES = [
  { value: "english", label: "English" },
  { value: "hindi", label: "Hindi" },
  { value: "tamil", label: "Tamil" },
  { value: "telugu", label: "Telugu" },
  { value: "kannada", label: "Kannada" },
  { value: "malayalam", label: "Malayalam" },
  { value: "marathi", label: "Marathi" },
  { value: "bengali", label: "Bengali" },
  { value: "gujarati", label: "Gujarati" },
  { value: "punjabi", label: "Punjabi" },
  { value: "urdu", label: "Urdu" },
  { value: "odia", label: "Odia" },
  { value: "other", label: "Other" },
];

const DIFFICULTY_OPTIONS = [
  {
    value: "beginner",
    label: "Beginner",
    description: "No prior knowledge required",
    color: "bg-green-100 text-green-800 border-green-200",
    dot: "bg-green-500",
  },
  {
    value: "intermediate",
    label: "Intermediate",
    description: "Some basic knowledge helpful",
    color: "bg-yellow-100 text-yellow-800 border-yellow-200",
    dot: "bg-yellow-500",
  },
  {
    value: "advanced",
    label: "Advanced",
    description: "Strong fundamentals required",
    color: "bg-orange-100 text-orange-800 border-orange-200",
    dot: "bg-orange-500",
  },
  {
    value: "expert",
    label: "Expert",
    description: "For seasoned practitioners",
    color: "bg-red-100 text-red-800 border-red-200",
    dot: "bg-red-500",
  },
] as const;

const VISIBILITY_OPTIONS = [
  {
    value: "public",
    label: "Public",
    description: "Visible to all users and search engines",
    icon: "🌍",
  },
  {
    value: "institutional",
    label: "Institutional",
    description: "Only visible to members of your institute",
    icon: "🏫",
  },
  {
    value: "private",
    label: "Private",
    description: "Only accessible via direct link",
    icon: "🔒",
  },
] as const;

// ── Tag Input Component ───────────────────────────────────────────────────────

interface TagInputProps {
  label: string;
  description?: string;
  placeholder?: string;
  value: string[];
  onChange: (tags: string[]) => void;
  error?: string;
  maxTags?: number;
  icon?: ReactNode;
}

function TagInput({
  label,
  description,
  placeholder = "Type and press Enter",
  value,
  onChange,
  error,
  maxTags = 20,
  icon,
}: TagInputProps) {
  const [inputValue, setInputValue] = useState("");

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (!tag || value.includes(tag) || value.length >= maxTags) return;
    onChange([...value, tag]);
    setInputValue("");
  };

  const removeTag = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
      removeTag(value.length - 1);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <Label className="text-sm font-medium">{label}</Label>
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}

      <div
        className={cn(
          "min-h-[44px] w-full rounded-md border bg-background px-3 py-2 flex flex-wrap gap-1.5 cursor-text",
          error ? "border-destructive" : "border-input",
          "focus-within:ring-1 focus-within:ring-ring",
        )}
        onClick={(e) => {
          const input = (e.currentTarget as HTMLDivElement).querySelector("input");
          input?.focus();
        }}
      >
        {value.map((tag, i) => (
          <Badge
            key={i}
            variant="secondary"
            className="flex items-center gap-1 text-xs h-6 pl-2 pr-1"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(i)}
              className="ml-0.5 rounded-full hover:bg-destructive/20 hover:text-destructive p-0.5 transition-colors"
              aria-label={`Remove ${tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addTag(inputValue)}
          placeholder={value.length === 0 ? placeholder : ""}
          className="flex-1 min-w-[120px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          aria-label={label}
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        {value.length} / {maxTags} • Press Enter or comma to add
      </p>
    </div>
  );
}

// ── Field wrapper ─────────────────────────────────────────────────────────────

function Field({
  label,
  description,
  error,
  required,
  children,
}: {
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Step1Props {
  defaultValues?: Partial<CreateCoursePayload>;
  onSave: (data: CreateCoursePayload) => Promise<void>;
  isSaving: boolean;
  categories: LmsCategory[];
  onDraftChange?: (data: CreateCourseSchema, isDirty: boolean) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Step1BasicInfo({
  defaultValues,
  onSave,
  isSaving,
  categories,
  onDraftChange,
}: Step1Props) {
  const { user } = useAuthStore();
  const instituteId = user?.institute_id;
  const [academicCourses, setAcademicCourses] = useState<Course[]>([]);
  const [isLoadingAcademic, setIsLoadingAcademic] = useState(false);

  useEffect(() => {
    if (!instituteId) return;
    setIsLoadingAcademic(true);
    getCoursesByInstitute(instituteId)
      .then((res) => {
        if (res.success) setAcademicCourses(res.data ?? []);
      })
      .finally(() => setIsLoadingAcademic(false));
  }, [instituteId]);

  const normalizedDefaults = useMemo(
    () => ({
      title: defaultValues?.title ?? "",
      subtitle: defaultValues?.subtitle ?? "",
      description: defaultValues?.description ?? "",
      category_id: defaultValues?.category_id ? String(defaultValues.category_id) : "",
      course_id: defaultValues?.course_id ? String(defaultValues.course_id) : "",
      difficulty: defaultValues?.difficulty ?? "beginner",
      language: defaultValues?.language ?? "english",
      estimated_duration_mins: defaultValues?.estimated_duration_mins ?? 0,
      visibility: defaultValues?.visibility ?? "institutional",
      pricing: defaultValues?.pricing ?? "free",
      price: defaultValues?.price ?? 0,
      tags: defaultValues?.tags ?? [],
      prerequisites: defaultValues?.prerequisites ?? [],
      learning_outcomes: defaultValues?.learning_outcomes ?? [],
    }),
    [defaultValues],
  );

  const submittingRef = useRef(false);

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    getValues,
    formState: { errors, isDirty },
  } = useForm<CreateCourseSchema>({
    resolver: zodResolver(createCourseSchema) as Resolver<CreateCourseSchema>,
    defaultValues: normalizedDefaults,
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  const pricing = watch("pricing");

  useEffect(() => {
    reset(normalizedDefaults, { keepDirty: false });
  }, [normalizedDefaults, reset]);

  useEffect(() => {
    if (!onDraftChange) return;
    const subscription = watch(() => {
      onDraftChange(getValues() as CreateCourseSchema, isDirty);
    });
    return () => subscription.unsubscribe();
  }, [watch, onDraftChange, isDirty, getValues]);

  const onSubmit = async (data: CreateCourseSchema) => {
    if (submittingRef.current || isSaving) return;
    submittingRef.current = true;
    try {
      await onSave(data as CreateCoursePayload);
    } finally {
      submittingRef.current = false;
    }
  };

  const onInvalid = () => {
    toast.error("Please fix the highlighted errors before continuing");
  };

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-8" noValidate>
      {/* ── Section 1: Core Details ── */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          Core Details
        </h3>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* Title */}
          <div className="md:col-span-2">
            <Field
              label="Course Title"
              description="A clear, descriptive title for your course (min. 3 characters)"
              error={errors.title?.message}
              required
            >
              <Input
                {...register("title")}
                placeholder="e.g. Complete Python Bootcamp for Beginners"
                className={cn(errors.title && "border-destructive")}
              />
            </Field>
          </div>

          {/* Subtitle */}
          <div className="md:col-span-2">
            <Field
              label="Subtitle"
              description="A brief tagline shown beneath the title on course cards"
              error={errors.subtitle?.message}
            >
              <Input
                {...register("subtitle")}
                placeholder="e.g. From zero to hero — master Python in 30 days"
                className={cn(errors.subtitle && "border-destructive")}
              />
            </Field>
          </div>

          {/* Description */}
          <div className="md:col-span-2">
            <Field
              label="Description"
              description="Detailed course overview — shown on the course landing page"
              error={errors.description?.message}
            >
              <Textarea
                {...register("description")}
                placeholder="Describe what students will learn, course structure, and who it's for..."
                rows={5}
                className={cn(errors.description && "border-destructive")}
              />
            </Field>
          </div>

          {/* Category */}
          <Field
            label="Category"
            description="Helps students discover your course"
            error={errors.category_id?.message}
          >
            <Controller
              name="category_id"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value || "none"}
                  onValueChange={(value) => field.onChange(value === "none" ? "" : value)}
                >
                  <SelectTrigger className={cn(errors.category_id && "border-destructive")}>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No category</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: cat.color }}
                          />
                          {cat.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          {/* Academic Course Link */}
          <Field
            label="Linked Academic Course"
            description="Link this content to a course from your institute's catalog"
            error={errors.course_id?.message}
          >
            <Controller
              name="course_id"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value || "none"}
                  onValueChange={(value) => field.onChange(value === "none" ? "" : value)}
                  disabled={isLoadingAcademic}
                >
                  <SelectTrigger className={cn(errors.course_id && "border-destructive")}>
                    {isLoadingAcademic ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Loading...</span>
                      </div>
                    ) : (
                      <SelectValue placeholder="Select academic course" />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not linked</SelectItem>
                    {academicCourses.map((course) => (
                      <SelectItem key={course.id} value={course.id}>
                        <div className="flex items-center gap-2">
                          <School className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{course.name}</span>
                          {course.code && (
                            <span className="text-[10px] text-muted-foreground font-mono bg-muted px-1 rounded">
                              {course.code}
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          {/* Language */}
          <Field
            label="Language"
            description="Primary language of instruction"
            error={errors.language?.message}
            required
          >
            <Controller
              name="language"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className={cn(errors.language && "border-destructive")}>
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((lang) => (
                      <SelectItem key={lang.value} value={lang.value}>
                        {lang.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          {/* Difficulty */}
          <div className="md:col-span-2">
            <Field
              label="Difficulty Level"
              description="Set expectations for students on the required skill level"
              error={errors.difficulty?.message}
              required
            >
              <Controller
                name="difficulty"
                control={control}
                render={({ field }) => (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {DIFFICULTY_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => field.onChange(opt.value)}
                        className={cn(
                          "rounded-lg border-2 p-3 text-left transition-all",
                          field.value === opt.value
                            ? cn("border-primary", opt.color)
                            : "border-border bg-background hover:border-border/80 hover:bg-muted/50",
                        )}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={cn("h-2 w-2 rounded-full flex-shrink-0", opt.dot)} />
                          <span className="text-sm font-medium">{opt.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-tight">
                          {opt.description}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              />
            </Field>
          </div>

          {/* Duration */}
          <Field
            label="Estimated Duration"
            description="Total estimated time to complete the course"
            error={errors.estimated_duration_mins?.message}
          >
            <div className="relative flex items-center">
              <Clock className="absolute left-3 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                {...register("estimated_duration_mins", {
                  setValueAs: (value) => {
                    if (value === "" || value === null || value === undefined) return 0;
                    const parsed = Number(value);
                    return Number.isNaN(parsed) ? 0 : parsed;
                  },
                })}
                type="number"
                min={0}
                placeholder="0"
                className={cn("pl-9 pr-20", errors.estimated_duration_mins && "border-destructive")}
              />
              <span className="absolute right-3 text-sm text-muted-foreground select-none">
                minutes
              </span>
            </div>
          </Field>
        </div>
      </div>

      <Separator />

      {/* ── Section 2: Visibility & Pricing ── */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          Visibility & Pricing
        </h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Visibility */}
          <Field label="Who can see this course?" error={errors.visibility?.message} required>
            <Controller
              name="visibility"
              control={control}
              render={({ field }) => (
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="space-y-2"
                >
                  {VISIBILITY_OPTIONS.map((opt) => (
                    <div
                      key={opt.value}
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                        field.value === opt.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/40",
                      )}
                      onClick={() => field.onChange(opt.value)}
                    >
                      <RadioGroupItem
                        value={opt.value}
                        id={`vis-${opt.value}`}
                        className="mt-0.5"
                      />
                      <div>
                        <Label
                          htmlFor={`vis-${opt.value}`}
                          className="cursor-pointer font-medium text-sm"
                        >
                          {opt.icon} {opt.label}
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                      </div>
                    </div>
                  ))}
                </RadioGroup>
              )}
            />
          </Field>

          {/* Pricing */}
          <div className="space-y-4">
            <Field label="Pricing" error={errors.pricing?.message} required>
              <Controller
                name="pricing"
                control={control}
                render={({ field }) => (
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    className="space-y-2"
                  >
                    <div
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                        field.value === "free"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/40",
                      )}
                      onClick={() => field.onChange("free")}
                    >
                      <RadioGroupItem value="free" id="pricing-free" className="mt-0.5" />
                      <div>
                        <Label
                          htmlFor="pricing-free"
                          className="cursor-pointer font-medium text-sm"
                        >
                          🆓 Free
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Open access — no payment required
                        </p>
                      </div>
                    </div>
                    <div
                      className={cn(
                        "flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                        field.value === "paid"
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/40",
                      )}
                      onClick={() => field.onChange("paid")}
                    >
                      <RadioGroupItem value="paid" id="pricing-paid" className="mt-0.5" />
                      <div>
                        <Label
                          htmlFor="pricing-paid"
                          className="cursor-pointer font-medium text-sm"
                        >
                          💳 Paid
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Students pay to enroll
                        </p>
                      </div>
                    </div>
                  </RadioGroup>
                )}
              />
            </Field>

            {pricing === "paid" && (
              <Field
                label="Price (INR)"
                description="Amount students pay to enroll"
                error={errors.price?.message}
                required
              >
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-sm text-muted-foreground font-medium">
                    ₹
                  </span>
                  <Input
                    {...register("price", {
                      setValueAs: (value) => {
                        if (value === "" || value === null || value === undefined) return 0;
                        const parsed = Number(value);
                        return Number.isNaN(parsed) ? 0 : parsed;
                      },
                    })}
                    type="number"
                    min={0}
                    step={1}
                    placeholder="499"
                    className={cn("pl-7", errors.price && "border-destructive")}
                  />
                </div>
              </Field>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* ── Section 3: Tags & Metadata ── */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Tag className="h-4 w-4 text-primary" />
          Tags & Learning Metadata
        </h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Tags */}
          <Controller
            name="tags"
            control={control}
            render={({ field }) => (
              <TagInput
                label="Course Tags"
                description="Keywords that help students find your course (max 20)"
                placeholder="e.g. Python, programming, backend"
                value={field.value}
                onChange={field.onChange}
                error={errors.tags?.message}
                maxTags={20}
                icon={<Tag className="h-3.5 w-3.5" />}
              />
            )}
          />

          {/* Prerequisites */}
          <Controller
            name="prerequisites"
            control={control}
            render={({ field }) => (
              <TagInput
                label="Prerequisites"
                description="What students should know before starting"
                placeholder="e.g. Basic math, HTML knowledge"
                value={field.value}
                onChange={field.onChange}
                error={errors.prerequisites?.message}
                maxTags={15}
              />
            )}
          />

          {/* Learning Outcomes */}
          <div className="md:col-span-2">
            <Controller
              name="learning_outcomes"
              control={control}
              render={({ field }) => (
                <TagInput
                  label="Learning Outcomes"
                  description="What students will be able to do after completing this course (max 15)"
                  placeholder="e.g. Build REST APIs, Deploy to cloud"
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.learning_outcomes?.message}
                  maxTags={15}
                />
              )}
            />
          </div>
        </div>
      </div>

      {/* ── Submit ── */}
      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={isSaving} className="min-w-[160px]">
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Plus className="h-4 w-4 mr-2" />
              Save & Continue
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
