import type { Logger } from "./logger.js";
import { hashIdentifier } from "./privacy.js";
import type { LlmResult, NegotiationJob, OutboundMessage } from "./types.js";

export type OutboundGateway = {
  send(job: NegotiationJob, result: LlmResult): Promise<OutboundMessage>;
  sendFallback(job: NegotiationJob): Promise<OutboundMessage>;
};

export function createMockWhatsAppGateway(logger: Logger): OutboundGateway {
  return {
    async send(job, result) {
      const outbound: OutboundMessage = {
        conversationId: job.conversationId,
        userIdHash: hashIdentifier(job.userId),
        text: result.reply,
        status: "sent"
      };

      logger.info("outbound.message_sent", {
        jobId: job.jobId,
        conversationId: job.conversationId,
        userIdHash: outbound.userIdHash,
        intent: result.intent,
        status: outbound.status
      });

      return outbound;
    },

    async sendFallback(job) {
      const outbound: OutboundMessage = {
        conversationId: job.conversationId,
        userIdHash: hashIdentifier(job.userId),
        text: "Estamos com instabilidade momentanea. Sua mensagem foi registrada e sera retomada em breve.",
        status: "fallback_sent"
      };

      logger.warn("outbound.fallback_sent", {
        jobId: job.jobId,
        conversationId: job.conversationId,
        userIdHash: outbound.userIdHash,
        status: outbound.status
      });

      return outbound;
    }
  };
}
