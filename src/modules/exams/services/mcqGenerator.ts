import type { ExamQuestion, ExamOption } from "../types";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

interface GeneratedQuestion {
  question_text: string;
  options: { option_text: string; is_correct: boolean }[];
  marks: number;
  explanation: string;
}

export async function generateMCQsFromText(
  text: string,
  options: {
    mode: "extract" | "generate";
    count?: number;
    difficulty?: "easy" | "medium" | "hard";
  }
): Promise<GeneratedQuestion[]> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey)
    throw new Error(
      "Groq API key not configured. Add VITE_GROQ_API_KEY to your .env file."
    );

  const systemPrompt =
    options.mode === "extract"
      ? `You are an MCQ extraction expert. Extract all multiple-choice questions from the given text. For each question, identify the question text, all options (A, B, C, D), and mark the correct answer. Return ONLY valid JSON.`
      : `You are an MCQ generation expert. Generate ${options.count || 10} multiple-choice questions from the given text content. Difficulty: ${options.difficulty || "medium"}. Each question should have 4 options with exactly one correct answer. Return ONLY valid JSON.`;

  const userPrompt = `${options.mode === "extract" ? "Extract all MCQs from" : "Generate MCQs from"} the following text:\n\n${text.slice(0, 8000)}\n\nReturn a JSON array of objects with this exact structure:\n[{"question_text": "...", "options": [{"option_text": "...", "is_correct": true/false}, ...], "marks": 1, "explanation": "..."}]\n\nReturn ONLY the JSON array, no other text.`;

  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    if (response.status === 429)
      throw new Error(
        "Rate limit exceeded. Please wait a moment and try again."
      );
    throw new Error(
      `Groq API error: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? "";

  // Parse JSON from response (handle markdown code blocks)
  let jsonStr = content.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    const questions: GeneratedQuestion[] = JSON.parse(jsonStr);
    // Validate and normalize
    return questions
      .filter((q) => q.question_text && q.options?.length >= 2)
      .map((q) => ({
        ...q,
        marks: q.marks || 1,
        explanation: q.explanation || "",
        options: q.options.map((opt) => ({
          option_text: opt.option_text,
          is_correct: !!opt.is_correct,
        })),
      }));
  } catch {
    throw new Error(
      "Failed to parse AI response. The generated content was not valid JSON. Please try again."
    );
  }
}
