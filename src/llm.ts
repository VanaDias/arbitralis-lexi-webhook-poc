import type { LlmResult, NegotiationJob } from "./types.js";

export type LlmClient = {
  process(job: NegotiationJob): Promise<LlmResult>;
};

export type SimulatedLlmOptions = {
  minDelayMs?: number;
  maxDelayMs?: number;
  failureRate?: number;
};

const defaultOptions: Required<SimulatedLlmOptions> = {
  minDelayMs: 500,
  maxDelayMs: 3500,
  failureRate: 0.25
};

export function createSimulatedLlm(options: SimulatedLlmOptions = {}): LlmClient {
  const config = { ...defaultOptions, ...options };

  return {
    async process(job) {
      const delayMs = randomBetween(config.minDelayMs, config.maxDelayMs);
      await sleep(delayMs);

      if (Math.random() < config.failureRate) {
        throw new Error("External LLM API failed or timed out");
      }

      return {
        intent: inferIntent(job.message),
        reply: "Recebemos sua mensagem. Posso te ajudar a construir uma proposta de acordo segura."
      };
    }
  };
}

function inferIntent(message: string): LlmResult["intent"] {
  const text = message.toLowerCase();

  if (text.includes("acordo") || text.includes("pagar") || text.includes("negociar")) {
    return "negotiate";
  }

  if (text.includes("?")) {
    return "question";
  }

  return "unknown";
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
