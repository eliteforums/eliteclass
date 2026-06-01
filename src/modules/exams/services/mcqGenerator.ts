import type { ExamQuestion, ExamOption } from "../types";
import { useAIKeyStore } from "@/store/aiKeyStore";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

interface GeneratedQuestion {
  question_text: string;
  options: { option_text: string; is_correct: boolean }[];
  marks: number;
  explanation: string;
}

function getGroqApiKey(): string | null {
  // 1. User-provided key from AI Key Setup (localStorage)
  const storeKey = useAIKeyStore.getState().apiKey;
  if (storeKey) return storeKey;
  // 2. Fallback: environment variable
  const envKey = import.meta.env.VITE_GROQ_API_KEY;
  if (envKey) return envKey;
  return null;
}

export async function generateMCQsFromText(
  text: string,
  options: {
    mode: "extract" | "generate";
    count?: number;
    difficulty?: "easy" | "medium" | "hard";
  }
): Promise<GeneratedQuestion[]> {
  const apiKey = getGroqApiKey();
  if (!apiKey)
    throw new Error(
      "Please add your Groq API key in AI Assistant → Settings first."
    );

  const systemPrompt =
    options.mode === "extract"
      ? `You are an MCQ extraction expert. Your ONLY task is to extract multiple-choice questions from text and return VALID JSON. CRITICAL: Return ONLY a JSON array. No markdown, no backticks, no explanation text.`
      : `You are an MCQ generation expert. Your ONLY task is to generate ${options.count || 10} multiple-choice questions and return VALID JSON. CRITICAL: Return ONLY a JSON array. No markdown, no backticks, no explanation text.`;

  const userPrompt = `${options.mode === "extract" ? "Extract all MCQs from" : "Generate MCQs from"} this text (Difficulty: ${options.difficulty || "medium"}):\n\n${text.slice(0, 5000)}\n\n=== REQUIRED JSON FORMAT ===\nReturn ONLY this JSON structure (no other text, no markdown, no backticks):\n[\n  {"question_text": "Question 1?", "options": [{"option_text": "A", "is_correct": true}, {"option_text": "B", "is_correct": false}, {"option_text": "C", "is_correct": false}, {"option_text": "D", "is_correct": false}], "marks": 1, "explanation": "Why A is correct"}\n]\n\n=== CRITICAL RULES ===\n1. Return ONLY valid JSON array\n2. NO markdown code blocks\n3. NO backticks\n4. NO explanatory text before or after\n5. Each question MUST have exactly "question_text", "options", "marks", and "explanation" fields\n6. Each option MUST have "option_text" and "is_correct" fields\n7. Exactly ONE option must have is_correct: true\n8. All booleans must be true or false (lowercase)`;

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
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    if (response.status === 413)
      throw new Error(
        "PDF content is too large. Please try with a smaller PDF or extract from specific pages only."
      );
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

  if (!content) {
    throw new Error("Groq API returned empty response. Please try again.");
  }

  console.log("Raw Groq response (first 500 chars):", content.substring(0, 500));

  // Parse JSON from response with multiple strategies
  let jsonStr = content.trim();

  // Strategy 1: Extract from markdown code blocks
  if (jsonStr.includes("```")) {
    const match = jsonStr.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
    if (match && match[1]) {
      jsonStr = match[1].trim();
      console.log("✓ Extracted JSON from markdown code block");
    }
  }

  // Strategy 2: Find JSON array in text
  if (!jsonStr.startsWith("[")) {
    const arrayMatch = jsonStr.match(/\[\s*{[\s\S]*}\s*\]/);
    if (arrayMatch) {
      jsonStr = arrayMatch[0];
      console.log("✓ Found JSON array in text");
    }
  }

  // Strategy 3: Remove common prefixes/suffixes
  jsonStr = jsonStr
    .replace(/^[^[\{]*/, "") // Remove everything before first [ or {
    .replace(/[^}\]]*$/, ""); // Remove everything after last } or ]

  console.log("Cleaned JSON (first 300 chars):", jsonStr.substring(0, 300));

  try {
    const questions: GeneratedQuestion[] = JSON.parse(jsonStr);
    if (!Array.isArray(questions)) {
      throw new Error("Response is not an array");
    }
    if (questions.length === 0) {
      throw new Error("No questions in response");
    }

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
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown parse error";
    console.error("✗ JSON parsing failed:", errorMsg);
    console.error("✗ Attempted to parse:", jsonStr.substring(0, 200));
    throw new Error(
      `Failed to parse AI response: ${errorMsg}. The AI may not have returned valid JSON. Please try again with different settings.`
    );
  }
}
