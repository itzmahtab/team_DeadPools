import { postProcessSafety } from "./safety.js";
import { SYSTEM_PROMPT } from "./prompts.js";

const providers = [
  {
    name: "OpenRouter",
    buildRequest(messages) {
      return {
        url: "https://openrouter.ai/api/v1/chat/completions",
        options: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPEN_RUTER_API_KEY}`,
          },
          body: JSON.stringify({
            model: process.env.MODEL_NAME || "anthropic/claude-sonnet-4",
            max_tokens: 1000,
            messages,
          }),
        },
      };
    },
    parseResponse(data) {
      return data.choices?.[0]?.message?.content?.trim();
    },
  },
  {
    name: "Gemini",
    buildRequest(messages) {
      const systemMsg = messages.find((m) => m.role === "system");
      const userMsg = messages.find((m) => m.role === "user");
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        options: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            system_instruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
            contents: [{ role: "user", parts: [{ text: userMsg?.content || "" }] }],
            generationConfig: { maxOutputTokens: 1000 },
          }),
        },
      };
    },
    parseResponse(data) {
      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    },
  },
  {
    name: "Grok",
    buildRequest(messages) {
      return {
        url: "https://api.x.ai/v1/chat/completions",
        options: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.GROK_API_KEY}`,
          },
          body: JSON.stringify({
            model: "grok-2",
            max_tokens: 1000,
            messages,
          }),
        },
      };
    },
    parseResponse(data) {
      return data.choices?.[0]?.message?.content?.trim();
    },
  },
];

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

export async function analyzeTicket(ticket) {
  const userMessage = buildUserMessage(ticket);
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  const errors = [];

  for (const provider of providers) {
    if (!provider.buildRequest) continue;

    const envKey = provider.name === "OpenRouter" ? "OPEN_RUTER_API_KEY" : provider.name === "Gemini" ? "GEMINI_API_KEY" : "GROK_API_KEY";
    if (!process.env[envKey]) {
      errors.push(`${provider.name}: no API key configured`);
      continue;
    }

    try {
      let lastErr;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));

        const { url, options } = provider.buildRequest(messages);
        const response = await fetch(url, options);

        if (response.status === 429) {
          lastErr = `${provider.name}: rate limited (attempt ${attempt + 1})`;
          continue;
        }

        if (!response.ok) {
          const errText = await response.text().catch(() => "");
          lastErr = `${provider.name}: HTTP ${response.status} — ${errText.slice(0, 100)}`;
          continue;
        }

        const data = await response.json();
        let rawText = provider.parseResponse(data);

        if (!rawText) {
          lastErr = `${provider.name}: empty response`;
          continue;
        }

        rawText = stripMarkdown(rawText);

        let resultDict;
        try {
          resultDict = JSON.parse(rawText);
        } catch (parseErr) {
          lastErr = `${provider.name}: JSON parse failed — ${rawText.slice(0, 80)}`;
          continue;
        }

        resultDict.ticket_id = ticket.ticket_id;
        resultDict = postProcessSafety(resultDict, ticket);

        return resultDict;
      }
      errors.push(lastErr);
    } catch (err) {
      errors.push(`${provider.name}: ${err.message}`);
    }
  }

  return fallbackResponse(
    ticket,
    "system_error",
    `All providers failed: ${errors.join("; ")}`,
    "Route to human agent immediately.",
    "Thank you for reaching out. We are looking into your concern and will get back to you through official channels. Please do not share your PIN or OTP with anyone."
  );
}
