# Module 1 — API & Schema (Team Member A)

## Responsibilities
- Express server setup, routes, middleware
- All Zod input/output schemas & enums
- Input validation, error handling
- Health endpoint + `/analyze-ticket` endpoint
- Project scaffolding (package.json, .env, git)

---

## Files You Own

### `schemas.js` — All Zod schemas

```javascript
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
});
```

### `server.js` — Express app

```javascript
import express from "express";
import dotenv from "dotenv";
import { TicketRequest, TicketResponse } from "./schemas.js";
import { analyzeTicket } from "./analyzer.js";

dotenv.config();

const app = express();
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/analyze-ticket", async (req, res) => {
  const parsed = TicketRequest.safeParse(req.body);

  if (!parsed.success) {
    return res.status(422).json({ error: "Invalid request body", details: parsed.error.issues });
  }

  try {
    const result = await analyzeTicket(parsed.data);
    const validated = TicketResponse.parse(result);
    res.json(validated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error. Please try again." });
  }
});

app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Malformed JSON body." });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error. Please try again." });
});

const port = process.env.PORT || 8000;
app.listen(port, "0.0.0.0", () => {
  console.log(`QueueStorm Investigator listening on port ${port}`);
});
```

### `package.json`

```json
{
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "node test_local.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "@anthropic-ai/sdk": "^0.32.0",
    "zod": "^3.23.0",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "nodemon": "^3.1.0"
  }
}
```

### `.env.example`

```
ANTHROPIC_API_KEY=
MODEL_NAME=claude-sonnet-4-6
PORT=8000
```

---

## What You Need From Other Team Members

- From **Module B**: the `analyzeTicket()` function in `analyzer.js` — you import it in `server.js`
- From **Module C**: nothing at runtime, but coordinate `safety.js` output shape so `TicketResponse.parse()` passes

## Your Tasks Checklist

- [ ] Create project folder, `npm init -y`, install deps
- [ ] Write `schemas.js` with all Zod schemas and enums
- [ ] Write `server.js` with Express routes
- [ ] Create `.env.example` and `.gitignore`
- [ ] `git init`, initial commit, push to GitHub
- [ ] Test `GET /health` returns `{"status":"ok"}`
- [ ] Test missing `ticket_id` returns 422
- [ ] Test malformed JSON returns 400
