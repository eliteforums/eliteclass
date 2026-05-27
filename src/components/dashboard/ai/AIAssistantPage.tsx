import { useAIKeyStore } from "@/store/aiKeyStore";
import { AIKeySetup } from "./AIKeySetup";
import { AIChat } from "./AIChat";

export function AIAssistantPage() {
  const { apiKey, isKeyValid } = useAIKeyStore();

  if (!apiKey || !isKeyValid) {
    return <AIKeySetup />;
  }

  return <AIChat />;
}
