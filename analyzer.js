import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import { postProcessSafety } from "./safety.js";
import { SYSTEM_PROMPT } from "./prompts.js";

dotenv.config();

// temporarily add near the top of analyzer.js, after dotenv.config()
   console.log("API key loaded:", process.env.ANTHROPIC_API_KEY ? "yes (" + process.env.ANTHROPIC_API_KEY.slice(0,8) + "...)" : "NO — MISSING");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function buildUserMessage(ticket) {
  const txnList = (ticket.transaction_history || []).map((t) => ({
    transaction_id: t.transaction_id,
    timestamp: t.timestamp,
    type: t.type,
    amount: t.amount,
    counterparty: t.counterparty,
    status: t.status,
  }));

  const payload = {
    ticket_id: ticket.ticket_id,
    complaint: ticket.complaint,
    language: ticket.language ?? null,
    channel: ticket.channel ?? null,
    user_type: ticket.user_type ?? null,
    campaign_context: ticket.campaign_context ?? null,
    transaction_history: txnList,
  };

  return `Analyze this support ticket and return a JSON response:\n\n${JSON.stringify(payload, null, 2)}`;
}

function fallbackResponse(ticket, reasonCode, agentSummary, nextAction, customerReply) {
  return {
    ticket_id: ticket.ticket_id,
    relevant_transaction_id: null,
    evidence_verdict: "insufficient_data",
    case_type: "other",
    severity: "low",
    department: "customer_support",
    agent_summary: agentSummary,
    recommended_next_action: nextAction,
    customer_reply: customerReply,
    human_review_required: true,
    confidence: 0.0,
    reason_codes: [reasonCode],
  };
}

export async function analyzeTicket(ticket) {
  const userMessage = buildUserMessage(ticket);

  try {
    const response = await client.messages.create({
      model: process.env.MODEL_NAME || "claude-sonnet-4-6",
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });

    let rawText = response.content[0].text.trim();

    // Strip markdown code fences if present
    if (rawText.startsWith("```")) {
      rawText = rawText.split("```")[1];
      if (rawText.startsWith("json")) {
        rawText = rawText.slice(4);
      }
      rawText = rawText.trim();
    }

    let resultDict;
    try {
      resultDict = JSON.parse(rawText);
    } catch (parseErr) {
      // Fallback safe response if LLM returns garbage
      return fallbackResponse(
        ticket,
        "processing_error",
        "Unable to process ticket automatically. Manual review required.",
        "Route to human agent for manual review.",
        "Thank you for contacting us. A support agent will review your case shortly. Please do not share your PIN or OTP with anyone."
      );
    }

    // Force ticket_id to match input
    resultDict.ticket_id = ticket.ticket_id;

    // Run safety post-processing (rule-based override)
    resultDict = postProcessSafety(resultDict, ticket);

    return resultDict;
} catch (err) {
  console.error("ANALYZER ERROR:", err);   // ADD THIS
  // Catch-all: never crash
  return fallbackResponse(
      ticket,
      "system_error",
      "System error during analysis. Manual review required.",
      "Route to human agent immediately.",
      "Thank you for reaching out. We are looking into your concern and will get back to you through official channels. Please do not share your PIN or OTP with anyone."
    );
  }
}