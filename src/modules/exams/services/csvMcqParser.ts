// CSV MCQ Parser Service
// Parses MCQ data from CSV file in the following format:
// question_text, option_1, option_2, option_3, option_4, correct_option (1-4), marks (optional), explanation (optional)

export interface CSVQuestion {
  question_text: string;
  options: Array<{ option_text: string; is_correct: boolean }>;
  marks: number;
  explanation: string;
}

export interface ParseResult {
  success: boolean;
  questions: CSVQuestion[];
  errors: string[];
  warnings: string[];
}

/**
 * Parse CSV file content and extract MCQ questions
 * CSV format: question_text,option1,option2,option3,option4,correct_option(1-4),marks,explanation
 */
export async function parseCSVMCQ(file: File): Promise<ParseResult> {
  const result: ParseResult = {
    success: false,
    questions: [],
    errors: [],
    warnings: [],
  };

  // Validate file
  if (!file.name.toLowerCase().endsWith(".csv")) {
    result.errors.push("File must be a CSV file (.csv)");
    return result;
  }

  if (file.size > 5 * 1024 * 1024) {
    result.errors.push("File size must be under 5 MB");
    return result;
  }

  try {
    const content = await file.text();
    const lines = content.split("\n").map((line) => line.trim()).filter((line) => line);

    if (lines.length === 0) {
      result.errors.push("CSV file is empty");
      return result;
    }

    // Skip header if present (first line shouldn't contain pipe characters)
    let startIndex = 0;
    const firstLine = lines[0].toLowerCase();
    if (
      firstLine.includes("question") ||
      firstLine.includes("option") ||
      firstLine.includes("correct")
    ) {
      startIndex = 1;
      console.log("✓ Skipped header row");
    }

    // Parse each line
    for (let i = startIndex; i < lines.length; i++) {
      const lineNum = i + 1;
      const line = lines[i];

      // Parse CSV line (handle quotes)
      const fields = parseCSVLine(line);

      if (fields.length < 5) {
        result.warnings.push(`Row ${lineNum}: Skipped (requires at least 5 fields: question, option1-4, correct_option)`);
        continue;
      }

      const question_text = fields[0]?.trim();
      const option1 = fields[1]?.trim();
      const option2 = fields[2]?.trim();
      const option3 = fields[3]?.trim();
      const option4 = fields[4]?.trim();
      const correct_option = fields[5]?.trim();
      const marks_str = fields[6]?.trim() || "1";
      const explanation = fields[7]?.trim() || "";

      // Validate required fields
      if (!question_text) {
        result.warnings.push(`Row ${lineNum}: Skipped (empty question)`);
        continue;
      }

      if (!option1 || !option2 || !option3 || !option4) {
        result.warnings.push(`Row ${lineNum}: Skipped (missing options)`);
        continue;
      }

      // Validate correct option
      const correctNum = parseInt(correct_option);
      if (!correct_option || isNaN(correctNum) || correctNum < 1 || correctNum > 4) {
        result.warnings.push(
          `Row ${lineNum}: Skipped (correct_option must be 1-4, got "${correct_option}")`
        );
        continue;
      }

      // Validate marks
      const marks = parseInt(marks_str);
      if (isNaN(marks) || marks < 1) {
        result.warnings.push(
          `Row ${lineNum}: Using default marks (1) instead of "${marks_str}"`
        );
      }

      // Create question object
      const question: CSVQuestion = {
        question_text,
        options: [
          { option_text: option1, is_correct: correctNum === 1 },
          { option_text: option2, is_correct: correctNum === 2 },
          { option_text: option3, is_correct: correctNum === 3 },
          { option_text: option4, is_correct: correctNum === 4 },
        ],
        marks: isNaN(marks) || marks < 1 ? 1 : marks,
        explanation,
      };

      result.questions.push(question);
      console.log(`✓ Parsed row ${lineNum}: ${question_text.substring(0, 50)}...`);
    }

    if (result.questions.length === 0) {
      result.errors.push("No valid questions found in CSV");
      return result;
    }

    result.success = true;
    console.log(`✓ Successfully parsed ${result.questions.length} questions from CSV`);
    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Failed to parse CSV";
    result.errors.push(`Failed to read file: ${errorMsg}`);
    return result;
  }
}

/**
 * Parse a CSV line handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      // Field separator
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  // Add last field
  fields.push(current);
  return fields;
}

/**
 * Generate CSV template for download
 */
export function generateCSVTemplate(): string {
  const header = "question_text,option_1,option_2,option_3,option_4,correct_option (1-4),marks (optional),explanation (optional)";
  const example1 =
    '"What is the capital of France?","Paris","London","Berlin","Madrid",1,1,"Paris is the capital city of France"';
  const example2 =
    '"Which planet is closest to the sun?","Earth","Venus","Mercury","Mars",3,1,"Mercury is the closest planet to the sun"';
  const example3 =
    '"What is 2 + 2?","3","4","5","6",2,1,"2 + 2 equals 4"';

  return [header, example1, example2, example3].join("\n");
}
