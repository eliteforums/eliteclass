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

  // Helper function to clean and fix common JSON issues
  function cleanJSON(str: string): string {
    let cleaned = str.trim();

    // Remove markdown code blocks
    if (cleaned.includes("```")) {
      const match = cleaned.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
      if (match && match[1]) {
        cleaned = match[1].trim();
        console.log("✓ Removed markdown code blocks");
      }
    }

    // Remove text before first [ or {
    const startIndex = Math.max(cleaned.indexOf("["), cleaned.indexOf("{"));
    if (startIndex > 0) {
      cleaned = cleaned.substring(startIndex);
      console.log("✓ Removed text before JSON");
    }

    // Remove text after last ] or }
    const lastBracket = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"));
    if (lastBracket >= 0 && lastBracket < cleaned.length - 1) {
      cleaned = cleaned.substring(0, lastBracket + 1);
      console.log("✓ Removed text after JSON");
    }

    // Replace smart quotes with regular quotes BEFORE any other processing
    cleaned = cleaned.replace(/[""]/g, '"');
    cleaned = cleaned.replace(/['']/g, "'");
    console.log("✓ Fixed smart quotes");

    // Fix trailing commas before ] and }
    cleaned = cleaned.replace(/,(\s*[}\]])/g, "$1");
    console.log("✓ Removed trailing commas");

    // Fix single quotes used instead of double quotes (but only in specific contexts)
    // This is risky but helps with some AI outputs
    // Only fix if it looks like a field name pattern: 'field_name':
    cleaned = cleaned.replace(/'([a-zA-Z_][a-zA-Z0-9_]*)'\s*:/g, '"$1":');
    console.log("✓ Fixed single-quoted field names");

    // Remove any null bytes or control characters (except newlines and tabs)
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, " ");
    console.log("✓ Removed control characters");

    // Try to fix unclosed strings by looking for patterns
    // This is a last resort attempt
    let quoteCount = 0;
    let inEscape = false;
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === "\\" && !inEscape) {
        inEscape = true;
      } else if (cleaned[i] === '"' && !inEscape) {
        quoteCount++;
      } else {
        inEscape = false;
      }
    }

    // If odd number of quotes, we might have an unclosed string
    if (quoteCount % 2 !== 0) {
      console.warn("⚠ Detected odd number of quotes - may have unclosed strings");
      // Try to find and close unclosed strings at the end
      const lastQuoteIndex = cleaned.lastIndexOf('"');
      if (lastQuoteIndex < cleaned.length - 10) {
        // If last quote is far from the end, there might be an unclosed string
        cleaned = cleaned.substring(0, lastQuoteIndex + 1);
        console.log("✓ Trimmed possible unclosed string");
      }
    }

    return cleaned;
  }

  let jsonStr = cleanJSON(content);
  console.log("Cleaned JSON (first 300 chars):", jsonStr.substring(0, 300));
  console.log("Cleaned JSON (last 300 chars):", jsonStr.substring(Math.max(0, jsonStr.length - 300)));
  console.log("Total JSON length:", jsonStr.length);

  try {
    const questions: GeneratedQuestion[] = JSON.parse(jsonStr);
    if (!Array.isArray(questions)) {
      throw new Error("Response is not an array");
    }
    if (questions.length === 0) {
      throw new Error("No questions in response");
    }

    console.log(`✓ Successfully parsed ${questions.length} questions`);

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

    // Try to find and log the problematic area
    if (errorMsg.includes("position")) {
      const posMatch = errorMsg.match(/position (\d+)/);
      if (posMatch) {
        const pos = parseInt(posMatch[1]);
        const start = Math.max(0, pos - 100);
        const end = Math.min(jsonStr.length, pos + 100);
        console.error("✗ Problem area (chars", start, "-", end, "):");
        console.error(jsonStr.substring(start, end));
        console.error(" ".repeat(pos - start) + "^ Error here");
      }
    }

    console.error("✗ Full JSON (first 300 chars):", jsonStr.substring(0, 300));
    console.error("✗ Full JSON (chars 7700-7900):", jsonStr.substring(7700, 7900));

    // Fallback: Try line-by-line salvaging
    console.log("🔧 Attempting to salvage valid questions from response...");
    const salvaged: GeneratedQuestion[] = [];
    
    // Try to find individual JSON objects
    const objectPattern = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
    const matches = jsonStr.match(objectPattern) || [];
    
    for (const match of matches) {
      try {
        const obj = JSON.parse(match);
        if (obj.question_text && obj.options && Array.isArray(obj.options)) {
          salvaged.push(obj);
          console.log("✓ Salvaged question:", obj.question_text.substring(0, 50));
        }
      } catch {
        // Skip this object
      }
    }

    if (salvaged.length > 0) {
      console.log(`✓ Salvaged ${salvaged.length} questions from malformed JSON`);
      return salvaged;
    }

    throw new Error(
      `Failed to parse AI response: ${errorMsg}. Try with fewer questions or simpler content.`
    );
  }
}
