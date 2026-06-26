# QueueStorm Investigator

AI/API support copilot for digital finance complaint triage.
Built for SUST CSE Carnival 2026 · Codex Community Hackathon.

## Setup

```bash
git clone <repo-url>
cd queuestorm-investigator
npm install
cp .env.example .env
# Fill in at least one API key in .env:
#   OPENROUTER_API_KEY or OPEN_RUTER_API_KEY (for OpenRouter models)
#   GEMINI_API_KEY (for Google Gemini fallback)
```

## Run

```bash
npm run dev        # development (http://localhost:3000)
npm run build      # production build
npm start          # production server
```

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check — returns `{"status":"ok"}` |
| POST | `/api/analyze-ticket` | Analyze a support ticket, returns structured JSON |

## Tech Stack

- **Next.js** (React) for the API layer
- **Multiple LLMs** (via OpenRouter + Google Gemini) for evidence reasoning
- **Zod** for schema validation and enum enforcement
- **Rule-based safety layer** (`lib/safety.js`) for hard safety checks

## AI / Model Usage

- **Primary**: Multiple free-tier models via OpenRouter (Nemotron, Gemma, Qwen, Llama, etc.)
- **Fallback**: Google Gemini 2.5 Flash (if OpenRouter is unavailable)
- **Ultimate fallback**: Deterministic safe response when all LLMs fail
- The LLM handles: evidence matching, verdict classification, case_type routing, department routing, severity assessment, agent summary, next action, and customer reply generation.
- The LLM is given the full complaint + transaction history and instructed to reason from the evidence before classifying.
- Models are raced (first successful response wins) for faster results.

## Safety Logic

A rule-based post-processing layer (`lib/safety.js`) runs AFTER the LLM response:

1. Scans `customer_reply` for forbidden patterns (PIN/OTP requests, unauthorized refund promises, suspicious third-party referrals).
2. If a violation is found, replaces the reply with a safe fallback.
3. Ensures PIN/OTP reminder is always present in `customer_reply`.
4. Forces phishing cases to critical severity + fraud_risk department.
5. Forces `ticket_id` to always match the input (injection protection).

The safety layer is **deterministic** and does not depend on the LLM.

## Models

| Model | Provider | Why |
|-------|----------|-----|
| nvidia/nemotron-3-ultra-550b | OpenRouter (free) | Primary reasoning |
| google/gemma-4-31b-it | OpenRouter (free) | Lightweight fallback |
| qwen/qwen3-next-80b-a3b | OpenRouter (free) | Alternative reasoning |
| meta-llama/llama-3.3-70b-instruct | OpenRouter (free) | Broad coverage |
| gemini-2.5-flash | Google AI (free) | Final fallback |

## Known Limitations

- Bangla text reasoning depends on LLM language capability.
- Ambiguous cases may need human review; the system flags them.
- If all LLM APIs are unavailable, a safe fallback response is returned.
- The system is a copilot only; no actions are taken autonomously.
- Accuracy depends on the LLM; different models may give different results for the same case.

## Sample Request

```json
POST /api/analyze-ticket
{
  "ticket_id": "TKT-001",
  "complaint": "I sent 5000 taka to the wrong number.",
  "language": "en",
  "channel": "in_app_chat",
  "user_type": "customer",
  "transaction_history": [
    {
      "transaction_id": "TXN-9101",
      "timestamp": "2026-04-14T14:08:22Z",
      "type": "transfer",
      "amount": 5000,
      "counterparty": "+8801719876543",
      "status": "completed"
    }
  ]
}
```

## Sample Response

```json
{
  "ticket_id": "TKT-001",
  "relevant_transaction_id": "TXN-9101",
  "evidence_verdict": "consistent",
  "case_type": "wrong_transfer",
  "severity": "high",
  "department": "dispute_resolution",
  "agent_summary": "Customer reports sending 5000 BDT to wrong recipient via TXN-9101.",
  "recommended_next_action": "Initiate wrong-transfer dispute workflow for TXN-9101.",
  "customer_reply": "We have noted your concern about TXN-9101. Our dispute team will review and contact you through official channels. Please do not share your PIN or OTP with anyone.",
  "human_review_required": true,
  "confidence": 0.9,
  "reason_codes": ["wrong_transfer", "transaction_match"],
  "rationale": "Transaction TXN-9101 matches the complaint amount (5000 BDT) and is the only transfer in the history. Evidence supports the wrong-transfer claim."
}
```

## Test

```bash
# Terminal 1: start the dev server
npm run dev

# Terminal 2: run tests
node test_local.js             # Local tests (sample_cases.json)
node test_official.js          # Official sample cases (stricter validation)
node test_edge_cases.js        # Edge cases (10 additional scenarios)
node test_safety.js            # Safety & adversarial tests (12 cases)
npm run test:all               # Run all official tests
npm run test:legacy            # Run legacy local tests
```
