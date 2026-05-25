export type WebhookPayload = {
  conversationId: string;
  userId: string;
  message: string;
  metadata?: Record<string, unknown>;
};

export type NegotiationJob = WebhookPayload & {
  jobId: string;
  receivedAt: string;
};

export type LlmResult = {
  reply: string;
  intent: "negotiate" | "question" | "unknown";
};

export type OutboundMessage = {
  conversationId: string;
  userIdHash: string;
  text: string;
  status: "sent" | "fallback_sent";
};
