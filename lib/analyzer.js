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

function fetchWithTimeout(url, options, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

function parseOpenRouterResponse(rawText) {
  let cleaned = stripMarkdown(rawText);
  return JSON.parse(cleaned);
}

async function tryOpenRouterModel(model, apiKey, messages) {
  const response = await fetchWithTimeout(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, max_tokens: 1000, messages }),
  }, 15000);

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content?.trim();
  if (!rawText) throw new Error("empty response");

  return parseOpenRouterResponse(rawText);
}

async function tryGemini(userMessage) {
  const geminiKey = getGeminiApiKey();
  if (!geminiKey) throw new Error("no api key");

  const response = await fetchWithTimeout(`${GEMINI_URL}/${GEMINI_MODEL}:generateContent?key=${geminiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ parts: [{ text: userMessage }] }],
      generationConfig: { maxOutputTokens: 1000, temperature: 0.2 },
    }),
  }, 15000);

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!rawText) throw new Error("empty response");

  return parseOpenRouterResponse(rawText);
}

function raceFirstSuccess(promises, ticket) {
  return new Promise((resolve) => {
    let remaining = promises.length;
    let settled = false;

    if (remaining === 0) return resolve(null);

    for (const p of promises) {
      p.then((result) => {
        if (settled) return;
        try {
          let dict = result;
          dict.ticket_id = ticket.ticket_id;
          dict = postProcessSafety(dict, ticket);
          settled = true;
          resolve(dict);
        } catch {}
      }).catch(() => {}).finally(() => {
        remaining--;
        if (remaining === 0 && !settled) resolve(null);
      });
    }
  });
}

export async function analyzeTicket(ticket) {
  const apiKey = getApiKey();
  const userMessage = buildUserMessage(ticket);
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  const promises = [];

  if (apiKey) {
    for (const model of OPENROUTER_MODELS) {
      promises.push(tryOpenRouterModel(model, apiKey, messages));
    }
  }

  promises.push(tryGemini(userMessage));

  const winner = await raceFirstSuccess(promises, ticket);

  if (winner) return winner;

  return fallbackResponse(
    ticket,
    "system_error",
    "All models failed or timed out",
    "Route to human agent immediately.",
    "Thank you for reaching out. We are looking into your concern and will get back to you through official channels. Do not share your PIN or OTP with anyone."
  );
}
