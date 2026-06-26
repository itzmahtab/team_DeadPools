import { postProcessSafety } from "./safety.js";
import { SYSTEM_PROMPT } from "./prompts.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODELS = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "openai/gpt-oss-120b:free",
  "google/gemma-4-31b-it:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "meta-llama/llama-3.3-70b-instruct:free",
];

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODEL = "gemini-2.5-flash";

function getApiKey() {
  return process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_API_KEY || process.env.OPEN_RUTER_API_KEY;
}

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GEMINI_API;
}

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

function stripMarkdown(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.split("```")[1];
    if (cleaned.startsWith("json")) cleaned = cleaned.slice(4);
    cleaned = cleaned.trim();
  }
  return cleaned;
}

async function callGemini(userMessage) {
  const geminiKey = getGeminiApiKey();
  if (!geminiKey) return null;

  try {
    const response = await fetch(`${GEMINI_URL}/${GEMINI_MODEL}:generateContent?key=${geminiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: { maxOutputTokens: 1000, temperature: 0.2 },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`HTTP ${response.status} — ${errText.slice(0, 120)}`);
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!rawText) throw new Error("empty response");

    return stripMarkdown(rawText);
  } catch (err) {
    console.error(`Gemini error: ${err.message}`);
    return null;
  }
}

export async function analyzeTicket(ticket) {
  const apiKey = getApiKey();
  const userMessage = buildUserMessage(ticket);
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  if (!apiKey) {
    const geminiResult = await callGemini(userMessage);
    if (geminiResult) {
      try {
        let resultDict = JSON.parse(geminiResult);
        resultDict.ticket_id = ticket.ticket_id;
        resultDict = postProcessSafety(resultDict, ticket);
        return resultDict;
      } catch {}
    }
    return fallbackResponse(
      ticket,
      "no_api_key",
      "No API key configured.",
      "Set OPENROUTER_API_KEY or GEMINI_API_KEY in .env",
      "Service temporarily unavailable. Please try again later. Do not share your PIN or OTP with anyone."
    );
  }

  const errors = [];

  for (const model of OPENROUTER_MODELS) {
    try {
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 1000,
          messages,
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        errors.push(`${model}: HTTP ${response.status} — ${errText.slice(0, 120)}`);
        continue;
      }

      const data = await response.json();
      let rawText = data.choices?.[0]?.message?.content?.trim();

      if (!rawText) {
        errors.push(`${model}: empty response`);
        continue;
      }

      rawText = stripMarkdown(rawText);

      let resultDict;
      try {
        resultDict = JSON.parse(rawText);
      } catch (parseErr) {
        errors.push(`${model}: JSON parse failed — ${rawText.slice(0, 80)}`);
        continue;
      }

      resultDict.ticket_id = ticket.ticket_id;
      resultDict = postProcessSafety(resultDict, ticket);

      return resultDict;
    } catch (err) {
      errors.push(`${model}: ${err.message}`);
    }
  }

  const geminiResult = await callGemini(userMessage);
  if (geminiResult) {
    try {
      let resultDict = JSON.parse(geminiResult);
      resultDict.ticket_id = ticket.ticket_id;
      resultDict = postProcessSafety(resultDict, ticket);
      return resultDict;
    } catch {
      errors.push(`Gemini: JSON parse failed`);
    }
  }

  return fallbackResponse(
    ticket,
    "system_error",
    `All models failed: ${errors.join("; ")}`,
    "Route to human agent immediately.",
    "Thank you for reaching out. We are looking into your concern and will get back to you through official channels. Do not share your PIN or OTP with anyone."
  );
}
