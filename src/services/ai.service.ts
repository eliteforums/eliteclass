// ---------------------------------------------------------------------------
// EliteClass — AI Service (Groq API)
//
// Shared AI service for generating student remarks, exam analytics,
// and communication drafts using the Groq API.
// ---------------------------------------------------------------------------

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.1-8b-instant";

async function callGroq(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) throw new Error("AI features require VITE_GROQ_API_KEY in your .env file.");

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
