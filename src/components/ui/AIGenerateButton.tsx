// ---------------------------------------------------------------------------
// AIGenerateButton — Reusable AI generation button with loading state
// Place this anywhere you want an "AI Generate" action.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { Sparkles, Loader2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AIGenerateButtonProps {
  /** The async function that generates AI content */
  onGenerate: () => Promise<string>;
  /** Called with the generated text */
  onResult?: (text: string) => void;
  /** Button label */
  label?: string;
  /** Button size */
  size?: "sm" | "default" | "lg";
  /** Additional class names */
  className?: string;
  /** Show the result inline below the button */
  showInline?: boolean;
}

export function AIGenerateButton({
  onGenerate,
  onResult,
  label = "AI Generate",
  size = "sm",
  className,
  showInline = false,
}: AIGenerateButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setIsGenerating(true);
    setResult(null);
    try {
      const text = await onGenerate();
      setResult(text);
      onResult?.(text);
      if (!showInline) {
        toast.success("AI content generated!");
      }
    } catch (err: any) {
      toast.error(err.message || "AI generation failed");
    } finally {
      setIsGenerating(false);
    }
  }

  function handleCopy() {
    if (result) {
      navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Copied to clipboard");
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <Button
        type="button"
        variant="outline"
        size={size}
        onClick={handleGenerate}
        disabled={isGenerating}
        className="gap-1.5"
      >
        {isGenerating ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        )}
        {isGenerating ? "Generating..." : label}
      </Button>

      {showInline && result && (
        <div className="relative rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-sm text-foreground whitespace-pre-wrap pr-8">{result}</p>
          <button
            type="button"
            onClick={handleCopy}
            className="absolute top-2 right-2 p-1 rounded hover:bg-muted transition-colors"
            title="Copy to clipboard"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
