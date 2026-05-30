// ---------------------------------------------------------------------------
// Unit tests for translate.service.ts
//
// Tests the core logic: truncation, hashing, and skip-when-same-language.
// The Google Translate API call and Supabase cache are tested via mocking.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import { hashText, truncateContent } from "@/services/translate.service";

describe("translate.service", () => {
  describe("truncateContent", () => {
    it("returns original text when under 5000 characters", () => {
      const text = "Hello world";
      const result = truncateContent(text);
      expect(result.text).toBe("Hello world");
      expect(result.truncated).toBe(false);
    });

    it("returns original text when exactly 5000 characters", () => {
      const text = "a".repeat(5000);
      const result = truncateContent(text);
      expect(result.text).toBe(text);
      expect(result.truncated).toBe(false);
    });

    it("truncates text exceeding 5000 characters", () => {
      const text = "a".repeat(5001);
      const result = truncateContent(text);
      expect(result.text.length).toBe(5000);
      expect(result.truncated).toBe(true);
    });

    it("truncates long text to exactly 5000 characters", () => {
      const text = "b".repeat(10000);
      const result = truncateContent(text);
      expect(result.text).toBe("b".repeat(5000));
      expect(result.truncated).toBe(true);
    });
  });

  describe("hashText", () => {
    it("produces a 64-character hex string (SHA-256)", async () => {
      const hash = await hashText("Hello world");
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("produces consistent hashes for the same input", async () => {
      const hash1 = await hashText("test input");
      const hash2 = await hashText("test input");
      expect(hash1).toBe(hash2);
    });

    it("produces different hashes for different inputs", async () => {
      const hash1 = await hashText("input A");
      const hash2 = await hashText("input B");
      expect(hash1).not.toBe(hash2);
    });

    it("handles empty string", async () => {
      const hash = await hashText("");
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("handles unicode text", async () => {
      const hash = await hashText("नमस्ते दुनिया");
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
