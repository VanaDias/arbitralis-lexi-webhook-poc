import sensible from "@fastify/sensible";
import Fastify from "fastify";
import { z } from "zod";
import { createInMemoryJobQueue, type JobQueue } from "./job-queue.js";
import { createLogger, type Logger } from "./logger.js";
import { createSimulatedLlm, type LlmClient } from "./llm.js";
import { createMockWhatsAppGateway, type OutboundGateway } from "./outbound.js";

const webhookSchema = z.object({
  conversationId: z.string().min(1),
  userId: z.string().min(1),
  message: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export type AppDeps = {
  queue?: JobQueue;
  llm?: LlmClient;
  outbound?: OutboundGateway;
  logger?: Logger;
};

export function buildApp(deps: AppDeps = {}) {
  const app = Fastify({ logger: false });
  const logger = deps.logger ?? createLogger();
  const outbound = deps.outbound ?? createMockWhatsAppGateway(logger);
  const llm = deps.llm ?? createSimulatedLlm();
  const queue = deps.queue ?? createInMemoryJobQueue({ llm, outbound, logger });

  app.decorate("queue", queue);
  app.register(sensible);

  app.get("/health", async () => ({ status: "ok" }));

  app.post("/webhook", async (request, reply) => {
    const parsed = webhookSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.badRequest("Invalid webhook payload");
    }

    const job = queue.enqueue(parsed.data);

    return reply.code(202).send({
      status: "accepted",
      jobId: job.jobId,
      message: "Webhook recebido. Processamento continuara em background."
    });
  });

  app.get("/jobs/:jobId", async (request, reply) => {
    const params = z.object({ jobId: z.string().uuid() }).safeParse(request.params);

    if (!params.success) {
      return reply.badRequest("Invalid job id");
    }

    const record = queue.get(params.data.jobId);

    if (!record) {
      return reply.notFound("Job not found");
    }

    return {
      jobId: record.job.jobId,
      status: record.status,
      attempts: record.attempts,
      error: record.error
    };
  });

  return app;
}

declare module "fastify" {
  interface FastifyInstance {
    queue: JobQueue;
  }
}
