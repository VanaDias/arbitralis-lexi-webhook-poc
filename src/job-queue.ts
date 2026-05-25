import { randomUUID } from "node:crypto";
import type { Logger } from "./logger.js";
import type { LlmClient } from "./llm.js";
import type { OutboundGateway } from "./outbound.js";
import { hashIdentifier, summarizeMessage } from "./privacy.js";
import type { NegotiationJob, WebhookPayload } from "./types.js";

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export type JobRecord = {
  job: NegotiationJob;
  status: JobStatus;
  attempts: number;
  error?: string;
};

export type JobQueue = {
  enqueue(payload: WebhookPayload): NegotiationJob;
  get(jobId: string): JobRecord | undefined;
  drain(): Promise<void>;
};

type QueueDeps = {
  llm: LlmClient;
  outbound: OutboundGateway;
  logger: Logger;
};

export function createInMemoryJobQueue({ llm, outbound, logger }: QueueDeps): JobQueue {
  const records = new Map<string, JobRecord>();
  const pending: Promise<void>[] = [];

  const processJob = async (record: JobRecord) => {
    record.status = "processing";
    record.attempts += 1;
    logger.info("job.processing_started", {
      jobId: record.job.jobId,
      conversationId: record.job.conversationId
    });

    try {
      const result = await llm.process(record.job);
      await outbound.send(record.job, result);
      record.status = "completed";
      logger.info("job.completed", { jobId: record.job.jobId });
    } catch (error) {
      record.status = "failed";
      record.error = error instanceof Error ? error.message : "Unknown error";
      logger.error("job.failed", {
        jobId: record.job.jobId,
        conversationId: record.job.conversationId,
        error: record.error
      });
      await outbound.sendFallback(record.job);
    }
  };

  return {
    enqueue(payload) {
      const job: NegotiationJob = {
        ...payload,
        jobId: randomUUID(),
        receivedAt: new Date().toISOString()
      };
      const record: JobRecord = { job, status: "queued", attempts: 0 };
      records.set(job.jobId, record);

      logger.info("job.queued", {
        jobId: job.jobId,
        conversationId: job.conversationId,
        userIdHash: hashIdentifier(job.userId),
        message: summarizeMessage(job.message)
      });

      const promise = processJob(record);
      pending.push(promise);
      promise.finally(() => {
        const index = pending.indexOf(promise);
        if (index >= 0) {
          pending.splice(index, 1);
        }
      });

      return job;
    },

    get(jobId) {
      return records.get(jobId);
    },

    async drain() {
      await Promise.allSettled([...pending]);
    }
  };
}
