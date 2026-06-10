import React, { useRef, useState } from "react";
import MonacoEditor, { type OnMount } from "@monaco-editor/react";
import { Loader2 } from "lucide-react";

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
  const [hasError, setHasError] = useState(false);

  // Fallback to textarea if Monaco fails to load
  if (hasError) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        className="w-full h-full min-h-[300px] p-4 font-mono text-sm bg-zinc-950 text-zinc-100 resize-none focus:outline-none"
        spellCheck={false}
      />
    );
  }

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
      loading={
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading editor...
        </div>
      }
      onError={() => setHasError(true)}
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
