import { buildApp } from "../src/app.js";
import { createInMemoryJobQueue } from "../src/job-queue.js";
import type { Logger, LogEntry } from "../src/logger.js";
import type { LlmClient } from "../src/llm.js";
import type { OutboundGateway } from "../src/outbound.js";
import type { LlmResult, NegotiationJob, OutboundMessage } from "../src/types.js";

function createMemoryLogger() {
  const entries: LogEntry[] = [];
  const logger: Logger = {
    info: (event, data) => entries.push({ level: "info", event, data }),
    warn: (event, data) => entries.push({ level: "warn", event, data }),
    error: (event, data) => entries.push({ level: "error", event, data })
  };

  return { logger, entries };
}

function createOutboundSpy(): OutboundGateway & { sent: OutboundMessage[] } {
  const sent: OutboundMessage[] = [];

  return {
    sent,
    async send(job: NegotiationJob, result: LlmResult) {
      const outbound: OutboundMessage = {
        conversationId: job.conversationId,
        userIdHash: "hash",
        text: result.reply,
        status: "sent"
      };
      sent.push(outbound);
      return outbound;
    },
    async sendFallback(job: NegotiationJob) {
      const outbound: OutboundMessage = {
        conversationId: job.conversationId,
        userIdHash: "hash",
        text: "fallback",
        status: "fallback_sent"
      };
      sent.push(outbound);
      return outbound;
    }
  };
}

describe("POST /webhook", () => {
  it("accepts the webhook immediately and processes the job in background", async () => {
    const { logger } = createMemoryLogger();
    const outbound = createOutboundSpy();
    let llmStarted = false;
    let releaseLlm!: () => void;
    const llm: LlmClient = {
      async process() {
        llmStarted = true;
        await new Promise<void>((resolve) => {
          releaseLlm = resolve;
        });
        return { intent: "negotiate", reply: "Proposta enviada." };
      }
    };
    const queue = createInMemoryJobQueue({ llm, outbound, logger });
    const app = buildApp({ queue });

    const response = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: {
        conversationId: "conv-123",
        userId: "5511999999999",
        message: "Quero negociar meu acordo"
      }
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ status: "accepted" });
    expect(llmStarted).toBe(true);
    expect(outbound.sent).toHaveLength(0);

    releaseLlm();
    await queue.drain();

    expect(outbound.sent).toEqual([
      expect.objectContaining({ conversationId: "conv-123", status: "sent" })
    ]);
  });

  it("sends a fallback message when the LLM fails", async () => {
    const { logger, entries } = createMemoryLogger();
    const outbound = createOutboundSpy();
    const llm: LlmClient = {
      async process() {
        throw new Error("LLM unavailable");
      }
    };
    const queue = createInMemoryJobQueue({ llm, outbound, logger });
    const app = buildApp({ queue });

    const response = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: {
        conversationId: "conv-err",
        userId: "user-sensitive-id",
        message: "Tenho duvidas sobre a divida"
      }
    });

    expect(response.statusCode).toBe(202);
    await queue.drain();

    const jobId = response.json<{ jobId: string }>().jobId;
    expect(queue.get(jobId)?.status).toBe("failed");
    expect(outbound.sent).toEqual([
      expect.objectContaining({ conversationId: "conv-err", status: "fallback_sent" })
    ]);
    expect(entries.some((entry) => entry.event === "job.failed")).toBe(true);
  });

  it("rejects invalid payloads without enqueueing work", async () => {
    const { logger } = createMemoryLogger();
    const outbound = createOutboundSpy();
    const llm: LlmClient = {
      async process() {
        return { intent: "unknown", reply: "ok" };
      }
    };
    const queue = createInMemoryJobQueue({ llm, outbound, logger });
    const app = buildApp({ queue });

    const response = await app.inject({
      method: "POST",
      url: "/webhook",
      payload: {
        conversationId: "",
        userId: "user-1",
        message: ""
      }
    });

    expect(response.statusCode).toBe(400);
    await queue.drain();
    expect(outbound.sent).toHaveLength(0);
  });

  it("does not log raw sensitive identifiers or message text", async () => {
    const { logger, entries } = createMemoryLogger();
    const outbound = createOutboundSpy();
    const llm: LlmClient = {
      async process() {
        return { intent: "question", reply: "ok" };
      }
    };
    const queue = createInMemoryJobQueue({ llm, outbound, logger });
    const app = buildApp({ queue });

    await app.inject({
      method: "POST",
      url: "/webhook",
      payload: {
        conversationId: "conv-privacy",
        userId: "551188887777",
        message: "Meu CPF 12345678900 quer desconto"
      }
    });
    await queue.drain();

    const serializedLogs = JSON.stringify(entries);
    expect(serializedLogs).not.toContain("551188887777");
    expect(serializedLogs).not.toContain("12345678900");
    expect(serializedLogs).not.toContain("Meu CPF");
  });
});
