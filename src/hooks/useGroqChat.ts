import { useState, useCallback } from "react";
import { useAIKeyStore } from "@/store/aiKeyStore";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

interface GroqChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  canRetry: boolean;
}

const SYSTEM_PROMPT =
  "You are an EliteClass AI study assistant. Help students with their coursework, explain concepts, and provide educational support. Be concise and helpful.";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.1-8b-instant";
const MAX_CONTEXT_MESSAGES = 20;

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useGroqChat() {
  const { apiKey, setKeyValid } = useAIKeyStore();
  const [state, setState] = useState<GroqChatState>({
    messages: [],
    isLoading: false,
    error: null,
    canRetry: false,
  });

  const sendMessage = useCallback(
    async (content: string) => {
      if (!apiKey || !content.trim()) return;

      const userMessage: ChatMessage = {
        id: generateId(),
        role: "user",
        content: content.trim(),
        timestamp: new Date(),
      };

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, userMessage],
        isLoading: true,
        error: null,
        canRetry: false,
      }));

      try {
        // Build context: system prompt + last N messages
        const contextMessages = [
          ...state.messages.slice(-MAX_CONTEXT_MESSAGES),
          userMessage,
        ].map((m) => ({ role: m.role, content: m.content }));

        const response = await fetch(GROQ_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              ...contextMessages,
            ],
          }),
        });

        if (!response.ok) {
          if (response.status === 401) {
            setKeyValid(false);
            setState((prev) => ({
              ...prev,
              isLoading: false,
              error: "Invalid API key. Please re-enter your Groq API key.",
              canRetry: false,
            }));
            return;
          }

          const errorText = response.status === 429
            ? "Rate limited. Please try again in a moment."
            : `API error (${response.status}). Please try again.`;

          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: errorText,
            canRetry: true,
          }));
          return;
        }

        const data = await response.json();
        const assistantContent =
          data.choices?.[0]?.message?.content ?? "Sorry, I couldn't generate a response.";

        const assistantMessage: ChatMessage = {
          id: generateId(),
          role: "assistant",
          content: assistantContent,
          timestamp: new Date(),
        };

        setState((prev) => ({
          ...prev,
          messages: [...prev.messages, assistantMessage],
          isLoading: false,
          error: null,
          canRetry: false,
        }));
      } catch {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: "Network error. Please check your connection and try again.",
          canRetry: true,
        }));
      }
    },
    [apiKey, state.messages, setKeyValid]
  );

  const clearChat = useCallback(() => {
    setState({
      messages: [],
      isLoading: false,
      error: null,
      canRetry: false,
    });
  }, []);

  const retryLast = useCallback(() => {
    const lastUserMessage = [...state.messages]
      .reverse()
      .find((m) => m.role === "user");
    if (lastUserMessage) {
      // Remove the last user message so sendMessage re-adds it
      setState((prev) => ({
        ...prev,
        messages: prev.messages.filter((m) => m.id !== lastUserMessage.id),
        error: null,
        canRetry: false,
      }));
      sendMessage(lastUserMessage.content);
    }
  }, [state.messages, sendMessage]);

  return {
    messages: state.messages,
    isLoading: state.isLoading,
    error: state.error,
    canRetry: state.canRetry,
    sendMessage,
    clearChat,
    retryLast,
  };
}
