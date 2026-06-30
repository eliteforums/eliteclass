// ---------------------------------------------------------------------------
// GroqKeyGate — inline Groq key entry for the games hub
// ---------------------------------------------------------------------------
// Wraps the GamesHub. When the user has no Groq key configured (and the
// VITE_GROQ_API_KEY env fallback isn't available either), shows an inline
// setup card with a detailed walkthrough, FAQ, and live validation.
// Once a key is saved the gate clears automatically because we subscribe to
// the store.
// ---------------------------------------------------------------------------

import { useState } from "react";
import {
  ChevronDown,
  CircleCheck,
  ExternalLink,
  Eye,
  EyeOff,
  Gamepad2,
  HelpCircle,
  KeyRound,
  Loader2,
  ShieldCheck,
  Sparkles,
  Wallet,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAIKeyStore } from "@/store/aiKeyStore";
import { cn } from "@/lib/utils";

const GROQ_PING_URL = "https://api.groq.com/openai/v1/models";
const GROQ_KEYS_URL = "https://console.groq.com/keys";
const GROQ_SIGNUP_URL = "https://console.groq.com";

interface GroqKeyGateProps {
  children: React.ReactNode;
}

export function GroqKeyGate({ children }: GroqKeyGateProps) {
  const apiKey = useAIKeyStore((s) => s.apiKey);
  const isKeyValid = useAIKeyStore((s) => s.isKeyValid);
  const envKey =
    typeof window !== "undefined"
      ? (import.meta.env.VITE_GROQ_API_KEY as string | undefined)
      : undefined;

  if ((apiKey || envKey) && isKeyValid) {
    return <>{children}</>;
  }

  return <KeyEntryForm reason={!isKeyValid ? "invalid" : "missing"} />;
}

// ── Setup card with detailed walkthrough ───────────────────────────────────

function KeyEntryForm({ reason }: { reason: "missing" | "invalid" }) {
  const setApiKey = useAIKeyStore((s) => s.setApiKey);
  const setKeyValid = useAIKeyStore((s) => s.setKeyValid);

  const [input, setInput] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(reason === "invalid"); // open by default if key was rejected
  const [faqOpen, setFaqOpen] = useState(false);

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
      const resp = await fetch(GROQ_PING_URL, {
        method: "GET",
        headers: { Authorization: `Bearer ${trimmed}` },
      });
      if (resp.status === 401) {
        setError("Groq rejected this key. Double-check it on console.groq.com.");
        setDetailsOpen(true);
        return;
      }
      if (!resp.ok) {
        setError(`Couldn't reach Groq (${resp.status}). Try again in a moment.`);
        return;
      }
      setApiKey(trimmed);
      setKeyValid(true);
    } catch {
      // Offline — save anyway, validation will happen on first game start.
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
          {/* ── Headline ─────────────────────────────────────────────── */}
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

          {/* ── Trust strip ─────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <TrustChip icon={Wallet} label="Free tier" sublabel="No credit card" tint="emerald" />
            <TrustChip icon={Zap} label="60 seconds" sublabel="To get a key" tint="amber" />
            <TrustChip icon={ShieldCheck} label="Private" sublabel="Stored on your device" tint="violet" />
          </div>

          {/* ── Quick steps (always visible) ────────────────────────── */}
          <div className="rounded-xl border border-border/60 bg-background/60 p-4 sm:p-5 space-y-3 text-sm">
            <p className="font-semibold flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-primary" />
              Quick start
            </p>
            <ol className="space-y-2 text-muted-foreground">
              <NumberStep n={1}>
                Go to{" "}
                <a
                  href={GROQ_KEYS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1 font-medium"
                >
                  console.groq.com/keys
                  <ExternalLink className="size-3" />
                </a>
              </NumberStep>
              <NumberStep n={2}>Sign in with Google or GitHub</NumberStep>
              <NumberStep n={3}>
                Click <span className="font-mono bg-muted/70 px-1.5 py-0.5 rounded text-foreground">Create API Key</span>, give it any name
              </NumberStep>
              <NumberStep n={4}>Copy the key shown and paste below</NumberStep>
            </ol>
          </div>

          {/* ── Detailed walkthrough (collapsible) ──────────────────── */}
          <Collapsible
            label={detailsOpen ? "Hide detailed walkthrough" : "Need more help? See step-by-step guide"}
            open={detailsOpen}
            onToggle={() => setDetailsOpen((v) => !v)}
            icon={HelpCircle}
          >
            <div className="space-y-3">
              <DetailStep
                n={1}
                title="Create a free Groq account"
                body={
                  <>
                    Open{" "}
                    <a
                      href={GROQ_SIGNUP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      console.groq.com
                      <ExternalLink className="size-3" />
                    </a>{" "}
                    in a new tab. Click "Sign Up" (top right) and continue with Google,
                    GitHub, or email. No payment information is required for the free tier.
                  </>
                }
              />
              <DetailStep
                n={2}
                title="Open the API Keys page"
                body={
                  <>
                    Once signed in, look at the left sidebar and click{" "}
                    <span className="font-mono bg-muted/70 px-1.5 py-0.5 rounded text-foreground">
                      API Keys
                    </span>
                    . Or jump straight there:{" "}
                    <a
                      href={GROQ_KEYS_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      console.groq.com/keys
                      <ExternalLink className="size-3" />
                    </a>
                    .
                  </>
                }
              />
              <DetailStep
                n={3}
                title="Click 'Create API Key'"
                body={
                  <>
                    The button is at the top of the keys list. A dialog will pop up asking
                    for a name — anything like{" "}
                    <span className="font-mono bg-muted/70 px-1.5 py-0.5 rounded text-foreground">
                      EliteClass Games
                    </span>{" "}
                    works. Then click <span className="font-semibold">Submit</span>.
                  </>
                }
              />
              <DetailStep
                n={4}
                title="Copy the key — it shows only once"
                body={
                  <>
                    Groq displays the full key right after creation, starting with{" "}
                    <span className="font-mono bg-muted/70 px-1.5 py-0.5 rounded text-foreground">
                      gsk_
                    </span>
                    . Click the copy icon next to it. If you close the dialog without
                    copying, you'll need to create a new key — Groq won't show it again
                    for security.
                  </>
                }
              />
              <DetailStep
                n={5}
                title="Paste it below and click 'Save & unlock games'"
                body={
                  <>
                    The input is below this guide. We'll instantly verify the key with
                    Groq. Once it's valid, the games hub loads and your key is saved
                    locally and to your private profile so you don't need to do this again
                    on this account.
                  </>
                }
              />
            </div>
          </Collapsible>

          {/* ── FAQ (collapsible) ───────────────────────────────────── */}
          <Collapsible
            label={faqOpen ? "Hide FAQ" : "Frequently asked questions"}
            open={faqOpen}
            onToggle={() => setFaqOpen((v) => !v)}
            icon={HelpCircle}
          >
            <div className="space-y-3 text-sm">
              <Faq q="Is it really free?">
                Yes. Groq's free tier gives generous daily request limits — far more than
                playing brain games will ever burn through. You won't be charged unless
                you explicitly add a payment method, which the games don't require.
              </Faq>
              <Faq q="Is my key safe?">
                It's stored only in your browser's local storage and, encrypted, in your
                Supabase auth metadata so it survives across devices. It is never sent to
                any third party. The only outbound call using your key is to Groq itself
                when generating game content.
              </Faq>
              <Faq q="Why do I need to provide my own key?">
                Generating fresh questions every game would cost the school real money at
                scale. By using your own free key, the school keeps it free for everyone
                and you get unlimited variety.
              </Faq>
              <Faq q="What if I forget my key?">
                Groq lets you revoke and create new keys any time on the API Keys page.
                If your saved key stops working you'll see a "Your key stopped working"
                message here and you can paste a fresh one.
              </Faq>
              <Faq q="Can I use the same key in other apps?">
                Yes. The key is yours and works with any Groq client. Just be aware that
                heavy use elsewhere counts toward the same daily limit.
              </Faq>
              <Faq q="Why does the key start with 'gsk_'?">
                That's the Groq convention. Every valid key starts with{" "}
                <span className="font-mono bg-muted/70 px-1 rounded">gsk_</span> followed
                by 50+ alphanumeric characters. If yours doesn't look like that, copy it
                again from Groq.
              </Faq>
            </div>
          </Collapsible>

          {/* ── Paste field + save ──────────────────────────────────── */}
          <div className="space-y-2 pt-2">
            <label className="text-sm font-semibold flex items-center gap-1.5">
              <KeyRound className="size-3.5 text-primary" />
              Paste your Groq API key
            </label>
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
              <p className="text-xs text-rose-600 dark:text-rose-400 flex items-start gap-1.5">
                <CircleCheck className="size-3.5 rotate-45 mt-0.5 shrink-0" />
                <span>{error}</span>
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
              <a href={GROQ_KEYS_URL} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-4" />
                Get a key
              </a>
            </Button>
          </div>

          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <ShieldCheck className="size-3.5 text-emerald-500 mt-0.5 shrink-0" />
            <span>
              Your key stays on this device and your private profile. We never share it
              with anyone — Groq is the only service we call.
            </span>
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

// ── Small presentational helpers ───────────────────────────────────────────

function NumberStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary mt-0.5">
        {n}
      </span>
      <span className="flex-1">{children}</span>
    </li>
  );
}

function DetailStep({
  n,
  title,
  body,
}: {
  n: number;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-card/50 p-3.5">
      <div className="flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 font-bold text-primary text-sm">
          {n}
        </span>
        <div className="space-y-1 flex-1 min-w-0">
          <p className="font-semibold text-sm">{title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
        </div>
      </div>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border/50 bg-card/50">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 text-left"
      >
        <span className="font-medium text-sm">{q}</span>
        <ChevronDown
          className={cn(
            "size-4 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="px-3.5 pb-3 text-xs text-muted-foreground leading-relaxed">
          {children}
        </div>
      )}
    </div>
  );
}

function Collapsible({
  label,
  open,
  onToggle,
  icon: Icon,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between gap-2 w-full text-sm font-medium text-primary hover:underline"
      >
        <span className="flex items-center gap-1.5">
          <Icon className="size-3.5" />
          {label}
        </span>
        <ChevronDown
          className={cn("size-4 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && <div className="pt-1">{children}</div>}
    </div>
  );
}

function TrustChip({
  icon: Icon,
  label,
  sublabel,
  tint,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;
  label: string;
  sublabel: string;
  tint: "emerald" | "amber" | "violet";
}) {
  const tintMap: Record<typeof tint, string> = {
    emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  };
  return (
    <div className="rounded-xl border border-border/50 bg-background/60 p-3 flex items-center gap-3">
      <div className={cn("size-9 rounded-lg flex items-center justify-center", tintMap[tint])}>
        <Icon className="size-4" />
      </div>
      <div>
        <p className="text-sm font-semibold leading-tight">{label}</p>
        <p className="text-xs text-muted-foreground">{sublabel}</p>
      </div>
    </div>
  );
}
