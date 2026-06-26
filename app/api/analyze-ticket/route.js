import { z } from "zod";
import { analyzeTicket } from "@/lib/analyzer.js";

const Language = z.enum(["en", "bn", "mixed"]);

const Channel = z.enum([
  "in_app_chat", "call_center", "email",
  "merchant_portal", "field_agent",
]);

const UserType = z.enum(["customer", "merchant", "agent", "unknown"]);

const TransactionType = z.enum([
  "transfer", "payment", "cash_in", "cash_out", "settlement", "refund",
]);

const TransactionStatus = z.enum([
  "completed", "failed", "pending", "reversed",
]);

const TransactionEntry = z.object({
  transaction_id: z.string(),
  timestamp: z.string(),
  type: TransactionType,
  amount: z.number(),
  counterparty: z.string(),
  status: TransactionStatus,
});

const TicketRequest = z.object({
  ticket_id: z.string(),
  complaint: z.string(),
  language: Language.optional().nullable(),
  channel: Channel.optional().nullable(),
  user_type: UserType.optional().nullable(),
  campaign_context: z.string().optional().nullable(),
  transaction_history: z.array(TransactionEntry).optional().default([]),
  metadata: z.any().optional().nullable(),
});

const EvidenceVerdict = z.enum([
  "consistent", "inconsistent", "insufficient_data",
]);

const CaseType = z.enum([
  "wrong_transfer", "payment_failed", "refund_request",
  "duplicate_payment", "merchant_settlement_delay",
  "agent_cash_in_issue", "phishing_or_social_engineering", "other",
]);

const Severity = z.enum(["low", "medium", "high", "critical"]);

const Department = z.enum([
  "customer_support", "dispute_resolution", "payments_ops",
  "merchant_operations", "agent_operations", "fraud_risk",
]);

const TicketResponse = z.object({
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
});

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return Response.json(
      { error: "Malformed JSON body." },
      { status: 400 }
    );
  }

  const parsed = TicketRequest.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request body", details: parsed.error.issues },
      { status: 422 }
    );
  }

  try {
    const result = await analyzeTicket(parsed.data);
    const validated = TicketResponse.parse(result);
    return Response.json(validated);
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: "Internal server error. Please try again." },
      { status: 500 }
    );
  }
}
