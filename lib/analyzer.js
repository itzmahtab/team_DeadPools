import { postProcessSafety } from "./safety.js";
import { SYSTEM_PROMPT } from "./prompts.js";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

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
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPEN_RUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.MODEL_NAME || "anthropic/claude-sonnet-4",
        max_tokens: 1000,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    let rawText = data.choices?.[0]?.message?.content?.trim();

    if (!rawText) {
      return fallbackResponse(
        ticket,
        "empty_response",
        "LLM returned empty response. Manual review required.",
        "Route to human agent for manual review.",
        "Thank you for contacting us. A support agent will review your case shortly. Please do not share your PIN or OTP with anyone."
      );
    }

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
      return fallbackResponse(
        ticket,
        "processing_error",
        "Unable to process ticket automatically. Manual review required.",
        "Route to human agent for manual review.",
        "Thank you for contacting us. A support agent will review your case shortly. Please do not share your PIN or OTP with anyone."
      );
    }

    resultDict.ticket_id = ticket.ticket_id;
    resultDict = postProcessSafety(resultDict, ticket);

    return resultDict;
  } catch (err) {
    return fallbackResponse(
      ticket,
      "system_error",
      "System error during analysis. Manual review required.",
      "Route to human agent immediately.",
      "Thank you for reaching out. We are looking into your concern and will get back to you through official channels. Please do not share your PIN or OTP with anyone."
    );
  }
}
