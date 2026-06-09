import React, { useRef } from "react";
import MonacoEditor, { type OnMount } from "@monaco-editor/react";

type EditorInstance = Parameters<OnMount>[0];

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: string;
  height?: string;
  readOnly?: boolean;
  theme?: "vs-dark" | "light";
}

const MONACO_LANGUAGE_MAP: Record<string, string> = {
  python: "python",
  javascript: "javascript",
  java: "java",
  cpp: "cpp",
  c: "c",
};

export function CodeEditor({
  value,
  onChange,
  language,
  height = "400px",
  readOnly = false,
  theme = "vs-dark",
}: CodeEditorProps) {
  const editorRef = useRef<EditorInstance | null>(null);

  return (
    <MonacoEditor
      height={height}
      language={MONACO_LANGUAGE_MAP[language] ?? "plaintext"}
      value={value}
      theme={theme}
      onChange={(v) => onChange(v ?? "")}
      onMount={(editor) => {
        editorRef.current = editor;
        editor.updateOptions({ readOnly });
      }}
      options={{
        fontSize: 14,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: "on",
        tabSize: 2,
        readOnly,
        automaticLayout: true,
        padding: { top: 12, bottom: 12 },
        lineNumbersMinChars: 3,
        renderLineHighlight: "line",
        cursorBlinking: "smooth",
      }}
    />
  );
}
