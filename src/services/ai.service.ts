// ---------------------------------------------------------------------------
// EliteClass — AI Service (Groq API)
//
// Shared AI service for generating student remarks, exam analytics,
// and communication drafts using the Groq API.
//
// API key resolution order:
// 1. User-provided key from the AI Key Setup UI (stored in localStorage)
// 2. Environment variable VITE_GROQ_API_KEY (for development/deployment)
// ---------------------------------------------------------------------------

import { useAIKeyStore } from "@/store/aiKeyStore";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

/**
 * Resolves the Groq API key from the user store (UI-provided) or env variable.
 */
function getApiKey(): string | null {
  // First: check the user-provided key (from AI Key Setup UI)
  const storeKey = useAIKeyStore.getState().apiKey;
  if (storeKey) return storeKey;

  // Fallback: environment variable
  const envKey = import.meta.env.VITE_GROQ_API_KEY;
  if (envKey) return envKey;

  return null;
}

async function callGroq(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("Please add your Groq API key in AI Insights → Settings, or set VITE_GROQ_API_KEY in your .env file.");

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      useAIKeyStore.getState().setKeyValid(false);
      throw new Error("Invalid API key. Please re-enter your Groq API key in AI settings.");
    }
    if (response.status === 429) throw new Error("Rate limit exceeded. Please wait and try again.");
    throw new Error(`AI service error (${response.status})`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// ── AI Student Remarks ───────────────────────────────────────────────────────

export interface StudentRemarkData {
  studentName: string;
  attendanceRate?: number;
  examScores?: { examName: string; percentage: number }[];
  coursesEnrolled?: number;
  coursesCompleted?: number;
  violationCount?: number;
}

/**
 * Generates a personalized AI remark/feedback for a student based on their performance data.
 */
export async function generateStudentRemark(data: StudentRemarkData): Promise<string> {
  const systemPrompt = `You are an experienced teacher writing brief, constructive remarks about a student's performance. Be encouraging but honest. Keep it to 2-3 sentences. Write in a professional tone suitable for a report card or progress report.`;

  const userPrompt = `Generate a performance remark for student "${data.studentName}" based on:
- Attendance rate: ${data.attendanceRate !== undefined ? `${data.attendanceRate}%` : "N/A"}
- Exam scores: ${data.examScores?.length ? data.examScores.map(e => `${e.examName}: ${e.percentage}%`).join(", ") : "No exams taken yet"}
- Courses enrolled: ${data.coursesEnrolled ?? 0}
- Courses completed: ${data.coursesCompleted ?? 0}
${data.violationCount ? `- Exam violations: ${data.violationCount}` : ""}

Write a brief, personalized remark (2-3 sentences).`;

  return callGroq(systemPrompt, userPrompt);
}

// ── AI Exam Analytics ────────────────────────────────────────────────────────

export interface ExamAnalyticsData {
  examTitle: string;
  totalStudents: number;
  averageScore: number;
  passRate: number;
  topScore: number;
  lowestScore: number;
  questionWisePerformance?: { question: string; correctRate: number }[];
}

/**
 * Generates AI-powered exam analytics summary with insights and recommendations.
 */
export async function generateExamAnalytics(data: ExamAnalyticsData): Promise<string> {
  const systemPrompt = `You are an educational analytics expert. Analyze exam results and provide actionable insights. Include: overall performance summary, weak areas identified, and specific recommendations for improvement. Use bullet points for clarity. Keep it concise (5-8 bullet points).`;

  const userPrompt = `Analyze the following exam results for "${data.examTitle}":
- Total students: ${data.totalStudents}
- Average score: ${data.averageScore}%
- Pass rate: ${data.passRate}%
- Highest score: ${data.topScore}%
- Lowest score: ${data.lowestScore}%
${data.questionWisePerformance?.length ? `\nQuestion-wise performance:\n${data.questionWisePerformance.map(q => `- "${q.question.slice(0, 50)}...": ${q.correctRate}% correct`).join("\n")}` : ""}

Provide:
1. Overall performance summary (1 sentence)
2. Key strengths identified
3. Weak areas that need attention
4. Specific recommendations for the teacher`;

  return callGroq(systemPrompt, userPrompt);
}

// ── AI Communication Drafts ──────────────────────────────────────────────────

export type CommunicationType = "announcement" | "fee_reminder" | "parent_update" | "event_notice" | "custom";

export interface CommunicationDraftData {
  type: CommunicationType;
  instituteName: string;
  recipientType: "students" | "parents" | "all";
  context?: string; // Additional context for the message
  studentName?: string; // For personalized messages
  amount?: number; // For fee reminders
  dueDate?: string; // For fee reminders
  eventName?: string; // For event notices
}

/**
 * Generates an AI-drafted communication message.
 */
export async function generateCommunicationDraft(data: CommunicationDraftData): Promise<string> {
  const systemPrompt = `You are a professional communication writer for an educational institute called "${data.instituteName}". Write clear, concise, and professional messages. Use a warm but formal tone. Keep messages brief (3-5 sentences for reminders, 5-8 sentences for announcements).`;

  let userPrompt = "";

  switch (data.type) {
    case "fee_reminder":
      userPrompt = `Write a polite fee payment reminder for ${data.recipientType === "parents" ? "parents" : "students"}.
${data.studentName ? `Student: ${data.studentName}` : ""}
${data.amount ? `Amount due: ₹${data.amount.toLocaleString("en-IN")}` : ""}
${data.dueDate ? `Due date: ${data.dueDate}` : ""}
Keep it professional and non-threatening. Include a call to action.`;
      break;

    case "announcement":
      userPrompt = `Write a general announcement for ${data.recipientType}.
Context: ${data.context || "General institute update"}
Keep it informative and engaging.`;
      break;

    case "parent_update":
      userPrompt = `Write a progress update message to parents about their child's performance.
${data.studentName ? `Student: ${data.studentName}` : ""}
Context: ${data.context || "Monthly progress update"}
Be positive and constructive.`;
      break;

    case "event_notice":
      userPrompt = `Write an event notification for ${data.recipientType}.
Event: ${data.eventName || data.context || "Upcoming event"}
Context: ${data.context || ""}
Include key details and encourage participation.`;
      break;

    case "custom":
      userPrompt = `Write a professional message for ${data.recipientType}.
Context: ${data.context || "Custom communication"}
Keep it clear and professional.`;
      break;
  }

  return callGroq(systemPrompt, userPrompt);
}

// ── AI Notes Summarization ───────────────────────────────────────────────────

/**
 * Summarizes long notes/content into concise bullet points.
 * Useful for lesson content, study material, or lecture notes.
 */
export async function summarizeNotes(text: string, options?: { style?: "bullets" | "paragraph" | "flashcards"; maxPoints?: number }): Promise<string> {
  const style = options?.style ?? "bullets";
  const maxPoints = options?.maxPoints ?? 8;

  const styleInstructions = {
    bullets: `Summarize into ${maxPoints} concise bullet points. Each point should capture one key concept.`,
    paragraph: `Write a concise summary paragraph (3-5 sentences) capturing the main ideas.`,
    flashcards: `Create ${maxPoints} Q&A flashcards from the content. Format: Q: [question]\\nA: [answer]`,
  };

  const systemPrompt = `You are an expert study assistant that creates clear, concise summaries of educational content. Focus on key concepts, definitions, and important facts. Make the summary easy to review and memorize.`;

  const userPrompt = `${styleInstructions[style]}\n\nContent to summarize:\n\n${text.slice(0, 6000)}`;

  return callGroq(systemPrompt, userPrompt);
}

// ── AI Lesson Plan Generator ─────────────────────────────────────────────────

export interface LessonPlanData {
  topic: string;
  subject?: string;
  duration?: string; // e.g. "45 minutes"
  level?: string; // e.g. "Beginner", "Intermediate", "Advanced"
  objectives?: string;
}

/**
 * Generates a structured lesson plan for a given topic.
 */
export async function generateLessonPlan(data: LessonPlanData): Promise<string> {
  const systemPrompt = `You are an experienced curriculum designer. Create structured, practical lesson plans that are easy to follow. Include clear objectives, activities, and assessment methods.`;

  const userPrompt = `Create a lesson plan for:
- Topic: ${data.topic}
${data.subject ? `- Subject: ${data.subject}` : ""}
${data.duration ? `- Duration: ${data.duration}` : "- Duration: 45 minutes"}
${data.level ? `- Level: ${data.level}` : ""}
${data.objectives ? `- Objectives: ${data.objectives}` : ""}

Include:
1. Learning Objectives (2-3 clear goals)
2. Introduction/Hook (5 min)
3. Main Content (broken into segments)
4. Activities/Practice
5. Assessment/Check for Understanding
6. Homework/Follow-up

Keep it practical and actionable.`;

  return callGroq(systemPrompt, userPrompt);
}

// ── AI Assignment Feedback ───────────────────────────────────────────────────

/**
 * Generates constructive feedback for a student's assignment submission.
 */
export async function generateAssignmentFeedback(data: {
  assignmentTitle: string;
  studentName: string;
  submissionContent?: string;
  score?: number;
  maxScore?: number;
}): Promise<string> {
  const systemPrompt = `You are a supportive teacher providing constructive feedback on student assignments. Be specific, encouraging, and suggest improvements. Keep feedback to 3-5 sentences.`;

  const userPrompt = `Provide feedback for:
- Assignment: "${data.assignmentTitle}"
- Student: ${data.studentName}
${data.score !== undefined ? `- Score: ${data.score}/${data.maxScore ?? 100}` : ""}
${data.submissionContent ? `- Submission preview: "${data.submissionContent.slice(0, 500)}"` : ""}

Write constructive feedback that:
1. Acknowledges what was done well
2. Identifies areas for improvement
3. Gives a specific suggestion for next time`;

  return callGroq(systemPrompt, userPrompt);
}

// ── AI Study Tips Generator ──────────────────────────────────────────────────

/**
 * Generates personalized study tips based on a student's weak areas.
 */
export async function generateStudyTips(data: {
  studentName: string;
  weakSubjects?: string[];
  upcomingExams?: string[];
  studyHoursPerDay?: number;
}): Promise<string> {
  const systemPrompt = `You are a study coach providing personalized, actionable study tips. Be specific and practical. Focus on techniques that actually work (spaced repetition, active recall, etc.).`;

  const userPrompt = `Generate personalized study tips for ${data.studentName}:
${data.weakSubjects?.length ? `- Weak areas: ${data.weakSubjects.join(", ")}` : ""}
${data.upcomingExams?.length ? `- Upcoming exams: ${data.upcomingExams.join(", ")}` : ""}
${data.studyHoursPerDay ? `- Available study time: ${data.studyHoursPerDay} hours/day` : ""}

Provide 5-6 specific, actionable study tips. Include:
- Time management suggestions
- Effective study techniques for their weak areas
- Exam preparation strategies`;

  return callGroq(systemPrompt, userPrompt);
}

// ── AI Course Description Generator ──────────────────────────────────────────

/**
 * Generates a professional course description from basic details.
 */
export async function generateCourseDescription(data: {
  title: string;
  topics?: string[];
  duration?: string;
  level?: string;
  targetAudience?: string;
}): Promise<string> {
  const systemPrompt = `You are a marketing copywriter for an educational platform. Write compelling, clear course descriptions that highlight value and outcomes. Keep it to 3-4 sentences.`;

  const userPrompt = `Write a course description for:
- Title: "${data.title}"
${data.topics?.length ? `- Topics covered: ${data.topics.join(", ")}` : ""}
${data.duration ? `- Duration: ${data.duration}` : ""}
${data.level ? `- Level: ${data.level}` : ""}
${data.targetAudience ? `- Target audience: ${data.targetAudience}` : ""}

Write a compelling 3-4 sentence description that:
1. Hooks the reader
2. Highlights what they'll learn
3. Mentions the outcome/benefit`;

  return callGroq(systemPrompt, userPrompt);
}

// ── AI Doubt Solver ──────────────────────────────────────────────────────────

/**
 * Answers a student's academic doubt/question with a clear explanation.
 */
export async function solveDoubt(data: {
  question: string;
  subject?: string;
  level?: string;
}): Promise<string> {
  const systemPrompt = `You are a patient, knowledgeable tutor. Explain concepts clearly using simple language. Use examples when helpful. If the question is ambiguous, provide the most likely interpretation and answer.`;

  const userPrompt = `A student asks:
"${data.question}"
${data.subject ? `Subject: ${data.subject}` : ""}
${data.level ? `Level: ${data.level}` : ""}

Provide a clear, concise explanation. Use an example if it helps clarify the concept.`;

  return callGroq(systemPrompt, userPrompt);
}
