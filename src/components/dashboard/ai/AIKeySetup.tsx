import { useState } from "react";
import { useAIKeyStore } from "@/store/aiKeyStore";
import { Sparkles, ExternalLink, Key } from "lucide-react";

export function AIKeySetup() {
  const { setApiKey } = useAIKeyStore();
  const [inputKey, setInputKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const trimmed = inputKey.trim();
    if (!trimmed) {
      setError("Please enter your API key.");
      return;
    }
    if (!trimmed.startsWith("gsk_")) {
      setError("Invalid key format. Groq API keys start with 'gsk_'.");
      return;
    }
    setError(null);
    setApiKey(trimmed);
  }

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">AI Study Assistant</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect your Groq API key to start chatting with the AI assistant.
          </p>
        </div>

        {/* Instructions Card */}
        <div className="rounded-xl border bg-card p-5">
          <h3 className="mb-3 text-sm font-medium">How to get your free API key:</h3>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                1
              </span>
              <span>
                Visit{" "}
                <a
                  href="https://console.groq.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  console.groq.com
                  <ExternalLink className="h-3 w-3" />
                </a>
              </span>
            </li>
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                2
              </span>
              <span>Sign up or log in to your Groq account</span>
            </li>
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                3
              </span>
              <span>Navigate to "API Keys" in the sidebar</span>
            </li>
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                4
              </span>
              <span>Click "Create API Key" and give it a name</span>
            </li>
            <li className="flex gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                5
              </span>
              <span>Copy the key and paste it below</span>
            </li>
          </ol>
        </div>

        {/* Input */}
        <div className="space-y-2">
          <div className="relative">
            <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="password"
              placeholder="gsk_xxxxxxxxxxxxxxxxxxxxxxxx"
              value={inputKey}
              onChange={(e) => {
                setInputKey(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
              className="w-full rounded-lg border bg-background py-2.5 pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <button
            onClick={handleSave}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Save Key
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Your key is stored locally in your browser and never sent to our servers.
        </p>
      </div>
    </div>
  );
}
