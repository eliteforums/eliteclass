// ---------------------------------------------------------------------------
// EliteClass — Game Content Generation via Groq
// ---------------------------------------------------------------------------
// Centralised AI calls for all AI Games. Reuses the user's Groq API key from
// `useAIKeyStore`, falling back to `VITE_GROQ_API_KEY` for dev/staging.
//
// Each generator:
//   - Builds a strict JSON-only system prompt
//   - Calls Groq Llama 3.3 70B
//   - Cleans the response of markdown / stray prose
//   - Validates the shape and trims to the requested count
//
// Errors are thrown as `Error` instances with friendly messages so games can
// surface them via toast.
// ---------------------------------------------------------------------------

import { useAIKeyStore } from "@/store/aiKeyStore";
import type {
  Difficulty,
  Flashcard,
  HangmanWord,
  QuizQuestion,
  ScrambleEntry,
  FillBlankEntry,
  TrueFalseStatement,
} from "../types";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

// ── Key resolution ──────────────────────────────────────────────────────────

function getGroqApiKey(): string | null {
  const storeKey = useAIKeyStore.getState().apiKey;
  if (storeKey) return storeKey;
  const envKey = import.meta.env.VITE_GROQ_API_KEY as string | undefined;
  if (envKey) return envKey;
  return null;
}

class MissingKeyError extends Error {
  constructor() {
    super(
      "Add your Groq API key in AI Assistant → Settings to play AI games.",
    );
    this.name = "MissingKeyError";
  }
}

// ── Core Groq call + JSON cleaner ───────────────────────────────────────────

async function callGroqJSON<T>(systemPrompt: string, userPrompt: string): Promise<T> {
  const apiKey = getGroqApiKey();
  if (!apiKey) throw new MissingKeyError();

  let response: Response;
  try {
    response = await fetch(GROQ_API_URL, {
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
        temperature: 0.6,
        max_tokens: 2048,
        response_format: { type: "json_object" },
      }),
    });
  } catch {
    throw new Error("Couldn't reach Groq. Check your connection and try again.");
  }

  if (response.status === 401) {
    useAIKeyStore.getState().setKeyValid(false);
    throw new Error("Your Groq API key looks invalid. Update it in AI Assistant → Settings.");
  }
  if (response.status === 429) {
    throw new Error("Groq rate limit hit. Wait a moment and try again.");
  }
  if (!response.ok) {
    throw new Error(`Groq API error (${response.status}). Try again in a moment.`);
  }

  const data = await response.json();
  const content: string = data.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("Groq returned an empty response. Try again.");

  return parseLooseJSON<T>(content);
}

function parseLooseJSON<T>(raw: string): T {
  let cleaned = raw.trim();
  if (cleaned.includes("```")) {
    const m = cleaned.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
    if (m?.[1]) cleaned = m[1].trim();
  }
  const start = Math.max(cleaned.indexOf("{"), cleaned.indexOf("["));
  if (start > 0) cleaned = cleaned.slice(start);
  const lastClose = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  if (lastClose >= 0 && lastClose < cleaned.length - 1) {
    cleaned = cleaned.slice(0, lastClose + 1);
  }
  cleaned = cleaned
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,(\s*[}\]])/g, "$1");

  try {
    return JSON.parse(cleaned) as T;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "parse error";
    throw new Error(`Couldn't parse AI response: ${msg}. Try again.`);
  }
}

// ── Generators ──────────────────────────────────────────────────────────────

/**
 * Quiz Rush — timed multiple-choice questions on a topic.
 */
export async function generateQuizQuestions(
  topic: string,
  difficulty: Difficulty,
  count: number,
): Promise<QuizQuestion[]> {
  const safeCount = clamp(count, 5, 20);
  const sys =
    "You are a quiz generator. Return ONLY a valid JSON object with a `questions` array. No prose, no markdown.";
  const user = `Generate ${safeCount} ${difficulty}-difficulty multiple-choice questions on the topic: "${topic}".

Return ONLY this JSON shape:
{"questions":[{"question":"...","options":["A","B","C","D"],"correctIndex":0,"explanation":"why"}]}

Rules:
- Exactly 4 options per question
- correctIndex is an integer 0..3 indicating the index of the correct option
- Each question must be self-contained and unambiguous
- Vary the correct index across questions
- No duplicate questions`;

  const out = await callGroqJSON<{ questions: QuizQuestion[] }>(sys, user);
  if (!Array.isArray(out.questions)) throw new Error("Quiz generator returned no questions.");
  return out.questions
    .filter(
      (q) =>
        typeof q.question === "string" &&
        Array.isArray(q.options) &&
        q.options.length === 4 &&
        typeof q.correctIndex === "number" &&
        q.correctIndex >= 0 &&
        q.correctIndex <= 3,
    )
    .slice(0, safeCount)
    .map((q) => ({
      question: q.question.trim(),
      options: q.options.map((o) => String(o).trim()),
      correctIndex: q.correctIndex,
      explanation: (q.explanation ?? "").trim(),
    }));
}

/**
 * Flashcard Match — term/definition pairs for a memory match game.
 */
export async function generateFlashcards(
  topic: string,
  difficulty: Difficulty,
  count: number,
): Promise<Flashcard[]> {
  const safeCount = clamp(count, 4, 12);
  const sys =
    "You are a flashcard generator. Return ONLY a valid JSON object with a `cards` array. No prose, no markdown.";
  const user = `Generate ${safeCount} ${difficulty}-difficulty term/definition flashcards on the topic: "${topic}".

Return ONLY this JSON shape:
{"cards":[{"term":"Short term (1-3 words)","definition":"Concise definition under 90 chars"}]}

Rules:
- Term must be 1-3 words, no punctuation
- Definition must be one sentence, under 90 characters
- Terms must be distinct
- Definitions must be unambiguous matches to their term`;

  const out = await callGroqJSON<{ cards: Flashcard[] }>(sys, user);
  if (!Array.isArray(out.cards)) throw new Error("Flashcard generator returned no cards.");
  return out.cards
    .filter((c) => typeof c.term === "string" && typeof c.definition === "string")
    .slice(0, safeCount)
    .map((c) => ({
      term: c.term.trim(),
      definition: c.definition.trim().slice(0, 110),
    }));
}

/**
 * Hangman — picks single-word terms with hints.
 */
export async function generateHangmanWords(
  topic: string,
  difficulty: Difficulty,
  count: number,
): Promise<HangmanWord[]> {
  const safeCount = clamp(count, 3, 10);
  const lenHint =
    difficulty === "easy" ? "5-7 letters" : difficulty === "hard" ? "9-14 letters" : "7-10 letters";
  const sys =
    "You are a hangman word generator. Return ONLY a valid JSON object with a `words` array. No prose, no markdown.";
  const user = `Generate ${safeCount} hangman words on the topic: "${topic}".

Return ONLY this JSON shape:
{"words":[{"word":"PHOTOSYNTHESIS","hint":"A short hint","category":"${topic}"}]}

Rules:
- Each word ${lenHint}, uppercase, A-Z only, no spaces or hyphens
- Each hint must NOT contain the answer word
- Words must be distinct
- Words must be real terms relevant to the topic`;

  const out = await callGroqJSON<{ words: HangmanWord[] }>(sys, user);
  if (!Array.isArray(out.words)) throw new Error("Hangman generator returned no words.");
  return out.words
    .filter(
      (w) =>
        typeof w.word === "string" &&
        /^[A-Z]{3,20}$/.test(w.word.trim().toUpperCase()) &&
        typeof w.hint === "string",
    )
    .slice(0, safeCount)
    .map((w) => ({
      word: w.word.trim().toUpperCase(),
      hint: w.hint.trim(),
      category: (w.category ?? topic).trim(),
    }));
}

/**
 * Word Scramble — scrambled terms with hints.
 */
export async function generateScramble(
  topic: string,
  difficulty: Difficulty,
  count: number,
): Promise<ScrambleEntry[]> {
  const safeCount = clamp(count, 5, 15);
  const sys =
    "You are a word-scramble generator. Return ONLY a valid JSON object with a `words` array. No prose, no markdown.";
  const user = `Generate ${safeCount} ${difficulty}-difficulty scramble entries on the topic: "${topic}".

Return ONLY this JSON shape:
{"words":[{"word":"MITOCHONDRIA","hint":"The powerhouse of the cell"}]}

Rules:
- Each word uppercase, A-Z only, no spaces or hyphens
- 5-12 letters
- Hint must NOT contain the answer
- Words distinct and relevant to topic`;

  const out = await callGroqJSON<{ words: ScrambleEntry[] }>(sys, user);
  if (!Array.isArray(out.words)) throw new Error("Scramble generator returned no words.");
  return out.words
    .filter(
      (w) =>
        typeof w.word === "string" &&
        /^[A-Z]{4,14}$/.test(w.word.trim().toUpperCase()) &&
        typeof w.hint === "string",
    )
    .slice(0, safeCount)
    .map((w) => ({
      word: w.word.trim().toUpperCase(),
      hint: w.hint.trim(),
    }));
}

/**
 * Fill in the Blanks — sentence with one missing key term.
 */
export async function generateFillBlanks(
  topic: string,
  difficulty: Difficulty,
  count: number,
): Promise<FillBlankEntry[]> {
  const safeCount = clamp(count, 5, 15);
  const sys =
    "You are a fill-in-the-blank generator. Return ONLY a valid JSON object with a `blanks` array. No prose, no markdown.";
  const user = `Generate ${safeCount} ${difficulty}-difficulty fill-in-the-blank items on the topic: "${topic}".

Return ONLY this JSON shape:
{"blanks":[{"sentence":"The ___ is the powerhouse of the cell.","answer":"mitochondria","hint":"Cellular organelle"}]}

Rules:
- Exactly one "___" per sentence
- Answer must be 1-2 words, no punctuation
- The sentence MUST NOT contain the answer outside the blank
- Hint must NOT contain the answer
- Items must be distinct`;

  const out = await callGroqJSON<{ blanks: FillBlankEntry[] }>(sys, user);
  if (!Array.isArray(out.blanks)) throw new Error("Fill-blanks generator returned no items.");
  return out.blanks
    .filter(
      (b) =>
        typeof b.sentence === "string" &&
        b.sentence.includes("___") &&
        typeof b.answer === "string" &&
        b.answer.trim().length > 0,
    )
    .slice(0, safeCount)
    .map((b) => ({
      sentence: b.sentence.trim(),
      answer: b.answer.trim(),
      hint: (b.hint ?? "").trim(),
    }));
}

/**
 * True / False Speedrun — rapid statements with truth value.
 */
export async function generateTrueFalse(
  topic: string,
  difficulty: Difficulty,
  count: number,
): Promise<TrueFalseStatement[]> {
  const safeCount = clamp(count, 10, 30);
  const sys =
    "You are a true/false statement generator. Return ONLY a valid JSON object with a `statements` array. No prose, no markdown.";
  const user = `Generate ${safeCount} ${difficulty}-difficulty true/false statements on the topic: "${topic}".

Return ONLY this JSON shape:
{"statements":[{"statement":"...","isTrue":true,"explanation":"why"}]}

Rules:
- Roughly half should be true, half false
- Each statement self-contained and unambiguous
- Avoid trick wording; statements are factually right or wrong
- Distinct statements`;

  const out = await callGroqJSON<{ statements: TrueFalseStatement[] }>(sys, user);
  if (!Array.isArray(out.statements))
    throw new Error("True/false generator returned no statements.");
  return out.statements
    .filter(
      (s) =>
        typeof s.statement === "string" &&
        typeof s.isTrue === "boolean" &&
        s.statement.length > 4,
    )
    .slice(0, safeCount)
    .map((s) => ({
      statement: s.statement.trim(),
      isTrue: !!s.isTrue,
      explanation: (s.explanation ?? "").trim(),
    }));
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export function hasGroqKey(): boolean {
  return getGroqApiKey() !== null;
}
