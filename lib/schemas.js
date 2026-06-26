import { z } from "zod";

export const Language = z.enum(["en", "bn", "mixed"]);

export const Channel = z.enum([
  "in_app_chat", "call_center", "email",
  "merchant_portal", "field_agent",
]);

export const UserType = z.enum(["customer", "merchant", "agent", "unknown"]);

export const TransactionType = z.enum([
  "transfer", "payment", "cash_in", "cash_out", "settlement", "refund",
]);

export const TransactionStatus = z.enum([
  "completed", "failed", "pending", "reversed",
]);

export const TransactionEntry = z.object({
  transaction_id: z.string(),
  timestamp: z.string(),
  type: TransactionType,
  amount: z.number(),
  counterparty: z.string(),
  status: TransactionStatus,
});

export const TicketRequest = z.object({
  ticket_id: z.string(),
  complaint: z.string(),
  language: Language.optional().nullable(),
  channel: Channel.optional().nullable(),
  user_type: UserType.optional().nullable(),
  campaign_context: z.string().optional().nullable(),
  transaction_history: z.array(TransactionEntry).optional().default([]),
  metadata: z.any().optional().nullable(),
});

export const EvidenceVerdict = z.enum([
  "consistent", "inconsistent", "insufficient_data",
]);

export const CaseType = z.enum([
  "wrong_transfer", "payment_failed", "refund_request",
  "duplicate_payment", "merchant_settlement_delay",
  "agent_cash_in_issue", "phishing_or_social_engineering", "other",
]);

export const Severity = z.enum(["low", "medium", "high", "critical"]);

export const Department = z.enum([
  "customer_support", "dispute_resolution", "payments_ops",
  "merchant_operations", "agent_operations", "fraud_risk",
]);

export const TicketResponse = z.object({
  ticket_id: z.string(),
  relevant_transaction_id: z.string().nullable(),
  evidence_verdict: EvidenceVerdict,
  case_type: CaseType,
  severity: Severity,
  department: Department,
  agent_summary: z.string(),
  recommended_next_action: z.string(),
  customer_reply: z.string(),
  human_review_required: z.boolean(),
  confidence: z.number().optional().nullable(),
  reason_codes: z.array(z.string()).optional().nullable(),
  rationale: z.string().optional().nullable(),
});
