// ---------------------------------------------------------------------------
// GroqKeyGate — inline Groq key entry for the games hub
// ---------------------------------------------------------------------------
// Wraps the GamesHub. When the user has no Groq key configured (and the
// VITE_GROQ_API_KEY env fallback isn't available either), shows an inline
// setup card instead of the hub. Once a key is saved the gate clears
// automatically because we subscribe to the store.
// ---------------------------------------------------------------------------

import { useState } from "react";
import {
  ExternalLink,
  Eye,
  EyeOff,
  Gamepad2,
  KeyRound,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAIKeyStore } from "@/store/aiKeyStore";

const GROQ_PING_URL = "https://api.groq.com/openai/v1/models";

interface GroqKeyGateProps {
  children: React.ReactNode;
}

export function GroqKeyGate({ children }: GroqKeyGateProps) {
  // Reactive subscription — when setApiKey fires, this re-renders.
  const apiKey = useAIKeyStore((s) => s.apiKey);
  const isKeyValid = useAIKeyStore((s) => s.isKeyValid);
  const envKey =
    typeof window !== "undefined" ? (import.meta.env.VITE_GROQ_API_KEY as string | undefined) : undefined;

  // If either source has a key and the store hasn't marked it invalid, render games.
  if ((apiKey || envKey) && isKeyValid) {
    return <>{children}</>;
  }

  return <KeyEntryForm reason={!isKeyValid ? "invalid" : "missing"} />;
}

function KeyEntryForm({ reason }: { reason: "missing" | "invalid" }) {
  const setApiKey = useAIKeyStore((s) => s.setApiKey);
  const setKeyValid = useAIKeyStore((s) => s.setKeyValid);

  const [input, setInput] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  async function save() {
    const trimmed = input.trim();
    if (!trimmed) {
      setError("Paste your Groq API key to continue.");
      return;
    }
    if (!trimmed.startsWith("gsk_")) {
      setError("That doesn't look right. Groq keys start with 'gsk_'.");
      return;
    }

    setError(null);
    setValidating(true);
    try {
      // Tiny GET — no token cost, just confirms the key is valid.
      const resp = await fetch(GROQ_PING_URL, {
        method: "GET",
        headers: { Authorization: `Bearer ${trimmed}` },
      });
      if (resp.status === 401) {
        setError("Groq rejected this key. Double-check it on console.groq.com.");
        return;
      }
      if (!resp.ok) {
        setError(`Couldn't reach Groq (${resp.status}). Try again in a moment.`);
        return;
      }
      setApiKey(trimmed);
      setKeyValid(true);
    } catch {
      // No connectivity — still save the key, but warn the user.
      setApiKey(trimmed);
      setKeyValid(true);
    } finally {
      setValidating(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Gamepad2 className="size-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Brain Games</h2>
        <Badge variant="secondary" className="gap-1">
          <Sparkles className="size-3" />
          AI-powered
        </Badge>
      </div>

      <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card">
        <CardContent className="p-6 sm:p-8 space-y-6">
          <div className="flex items-start gap-4">
            <div className="size-12 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <KeyRound className="size-6 text-primary" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold">
                {reason === "invalid" ? "Your key stopped working" : "Connect Groq to play"}
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
                Brain Games use Groq AI to generate fresh questions, scrambles, hangman
                words and quizzes every time you play. Paste your free Groq key once and
                it'll be saved for every future game.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/60 p-4 sm:p-5 space-y-3 text-sm">
            <p className="font-semibold flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-primary" />
              How to grab a free key (60 seconds):
            </p>
            <ol className="space-y-1.5 list-decimal list-inside text-muted-foreground">
              <li>
                Visit{" "}
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  console.groq.com/keys
                  <ExternalLink className="size-3" />
                </a>
              </li>
              <li>Sign in with Google or GitHub (no credit card needed)</li>
              <li>Click "Create API Key", give it any name</li>
              <li>Copy the key and paste it below</li>
            </ol>
          </div>

          <div className="space-y-2">
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                type={show ? "text" : "password"}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void save();
                }}
                placeholder="gsk_xxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full rounded-xl border border-border/60 bg-background py-2.5 pl-10 pr-12 text-sm font-mono tracking-wider placeholder:text-muted-foreground/60 placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/40"
                autoFocus
                spellCheck={false}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={show ? "Hide key" : "Show key"}
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {error && (
              <p className="text-xs text-rose-600 dark:text-rose-400 flex items-center gap-1">
                {error}
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={() => void save()}
              size="lg"
              className="flex-1 gap-2"
              disabled={validating}
            >
              {validating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Checking key with Groq...
                </>
              ) : (
                <>
                  <ShieldCheck className="size-4" />
                  Save &amp; unlock games
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="lg"
              asChild
              className="gap-2"
            >
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="size-4" />
                Get a key
              </a>
            </Button>
          </div>

          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-emerald-500" />
            Your key stays on this device and your private profile. It never leaves to any
            third party — Groq is the only service we call.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
