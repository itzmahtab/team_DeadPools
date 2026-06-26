import fs from "fs";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const DELAY_MS = 2000;

const EDGE_CASES = [
  {
    id: "EDGE-01",
    label: "Empty transaction history with vague complaint",
    input: {
      ticket_id: "TKT-E01",
      complaint: "Help me please.",
      language: "en",
      channel: "in_app_chat",
      user_type: "customer",
      transaction_history: [],
    },
    expect: {
      evidence_verdict: "insufficient_data",
      relevant_transaction_id: null,
    },
  },
  {
    id: "EDGE-02",
    label: "Bangla complaint with no transaction history",
    input: {
      ticket_id: "TKT-E02",
      complaint: "আমার টাকা হারিয়ে গেছে। দয়া করে সাহায্য করুন।",
      language: "bn",
      channel: "call_center",
      user_type: "customer",
      transaction_history: [],
    },
    expect: {
      evidence_verdict: "insufficient_data",
      case_type: "other",
    },
  },
  {
    id: "EDGE-03",
    label: "Large amount wrong transfer",
    input: {
      ticket_id: "TKT-E03",
      complaint: "I accidentally sent 500000 taka to the wrong number. This is my entire savings. Please help immediately!",
      language: "en",
      channel: "call_center",
      user_type: "customer",
      transaction_history: [
        {
          transaction_id: "TXN-E03",
          timestamp: "2026-04-14T10:00:00Z",
          type: "transfer",
          amount: 500000,
          counterparty: "+8801999999999",
          status: "completed",
        },
      ],
    },
    expect: {
      evidence_verdict: "consistent",
      case_type: "wrong_transfer",
      severity: "high",
      department: "dispute_resolution",
      human_review_required: true,
    },
  },
  {
    id: "EDGE-04",
    label: "Cash out not received",
    input: {
      ticket_id: "TKT-E04",
      complaint: "I did cash out of 8000 taka from agent but didn't receive the money. Agent gave me the cash but my account shows deducted.",
      language: "en",
      channel: "field_agent",
      user_type: "customer",
      transaction_history: [
        {
          transaction_id: "TXN-E04",
          timestamp: "2026-04-14T11:00:00Z",
          type: "cash_out",
          amount: 8000,
          counterparty: "AGENT-100",
          status: "completed",
        },
      ],
    },
    expect: {
      relevant_transaction_id: "TXN-E04",
      evidence_verdict: "consistent",
    },
  },
  {
    id: "EDGE-05",
    label: "Refund for completed transfer - friend doesn't need it",
    input: {
      ticket_id: "TKT-E05",
      complaint: "I sent 3000 taka to my friend but he said he doesn't need it anymore. Can I get a refund?",
      language: "en",
      channel: "in_app_chat",
      user_type: "customer",
      transaction_history: [
        {
          transaction_id: "TXN-E05",
          timestamp: "2026-04-13T09:00:00Z",
          type: "transfer",
          amount: 3000,
          counterparty: "+8801612345678",
          status: "completed",
        },
      ],
    },
    expect: {
      case_type: "refund_request",
      evidence_verdict: "consistent",
    },
  },
  {
    id: "EDGE-06",
    label: "Mixed language complaint",
    input: {
      ticket_id: "TKT-E06",
      complaint: "amar 2000 taka lost hoye geche. ami wrong number e pathiyechi. please help.",
      language: "mixed",
      channel: "in_app_chat",
      user_type: "customer",
      transaction_history: [
        {
          transaction_id: "TXN-E06",
          timestamp: "2026-04-14T12:00:00Z",
          type: "transfer",
          amount: 2000,
          counterparty: "+8801511112222",
          status: "completed",
        },
      ],
    },
    expect: {
      relevant_transaction_id: "TXN-E06",
      evidence_verdict: "consistent",
    },
  },
  {
    id: "EDGE-07",
    label: "Multiple completed payments - not duplicate (different amounts)",
    input: {
      ticket_id: "TKT-E07",
      complaint: "I made two payments today. Are both correct?",
      language: "en",
      channel: "in_app_chat",
      user_type: "customer",
      transaction_history: [
        {
          transaction_id: "TXN-E07A",
          timestamp: "2026-04-14T08:00:00Z",
          type: "payment",
          amount: 500,
          counterparty: "MERCHANT-A",
          status: "completed",
        },
        {
          transaction_id: "TXN-E07B",
          timestamp: "2026-04-14T10:00:00Z",
          type: "payment",
          amount: 1200,
          counterparty: "MERCHANT-B",
          status: "completed",
        },
      ],
    },
    expect: {
      relevant_transaction_id: null,
      evidence_verdict: "insufficient_data",
      case_type: "other",
    },
  },
  {
    id: "EDGE-08",
    label: "Merchant with multiple pending settlements",
    input: {
      ticket_id: "TKT-E08",
      complaint: "My settlements for the last 2 days have not been processed. I am a merchant.",
      language: "en",
      channel: "merchant_portal",
      user_type: "merchant",
      transaction_history: [
        {
          transaction_id: "TXN-E08A",
          timestamp: "2026-04-12T18:00:00Z",
          type: "settlement",
          amount: 10000,
          counterparty: "MERCHANT-SELF",
          status: "pending",
        },
        {
          transaction_id: "TXN-E08B",
          timestamp: "2026-04-13T18:00:00Z",
          type: "settlement",
          amount: 12000,
          counterparty: "MERCHANT-SELF",
          status: "pending",
        },
      ],
    },
    expect: {
      case_type: "merchant_settlement_delay",
      department: "merchant_operations",
    },
  },
  {
    id: "EDGE-09",
    label: "Reversed transaction complaint",
    input: {
      ticket_id: "TKT-E09",
      complaint: "I sent 4000 taka but it was reversed. I didn't ask for a reversal.",
      language: "en",
      channel: "in_app_chat",
      user_type: "customer",
      transaction_history: [
        {
          transaction_id: "TXN-E09",
          timestamp: "2026-04-14T13:00:00Z",
          type: "transfer",
          amount: 4000,
          counterparty: "+8801311112222",
          status: "reversed",
        },
      ],
    },
    expect: {
      relevant_transaction_id: "TXN-E09",
      evidence_verdict: "consistent",
    },
  },
  {
    id: "EDGE-10",
    label: "Agent unknown user type",
    input: {
      ticket_id: "TKT-E10",
      complaint: "Cash in of 5000 taka through agent is not showing in my balance.",
      language: "en",
      channel: "field_agent",
      user_type: "unknown",
      transaction_history: [
        {
          transaction_id: "TXN-E10",
          timestamp: "2026-04-14T14:00:00Z",
          type: "cash_in",
          amount: 5000,
          counterparty: "AGENT-999",
          status: "pending",
        },
      ],
    },
    expect: {
      relevant_transaction_id: "TXN-E10",
      evidence_verdict: "consistent",
    },
  },
];

const FORBIDDEN_REPLY_PATTERNS = [
  /\bplease share your (pin|otp|password)\b/i,
  /\bkindly share your (pin|otp|password)\b/i,
  /\bprovide your (pin|otp|password)\b/i,
  /\benter your (pin|otp|password)\b/i,
  /\bwe will refund\b/i,
  /\brefund is (approved|confirmed)\b/i,
  /\byou will get.*refund\b/i,
  /\byour pin is\b/i,
  /\byour otp is\b/i,
];

function checkSafety(text) {
  const violations = [];
  for (const p of FORBIDDEN_REPLY_PATTERNS) {
    if (p.test(text)) violations.push(p.source);
  }
  return violations;
}

async function run() {
  console.log("=".repeat(60));
  console.log(`Edge Cases — ${EDGE_CASES.length} tests`);
  console.log("=".repeat(60));

  let passed = 0;
  let failed = 0;

  for (const tc of EDGE_CASES) {
    await new Promise((r) => setTimeout(r, DELAY_MS));

    const start = Date.now();
    const resp = await fetch(`${BASE_URL}/api/analyze-ticket`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tc.input),
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    if (resp.status !== 200) {
      console.log(`FAIL [${tc.id}] ${tc.label} (${elapsed}s) — HTTP ${resp.status}`);
      failed++;
      continue;
    }

    const out = await resp.json();
    let ok = true;

    for (const [field, expectedVal] of Object.entries(tc.expect)) {
      if (out[field] !== expectedVal) {
        console.log(`FAIL [${tc.id}] ${tc.label} (${elapsed}s)`);
        console.log(`  ${field}: got=${JSON.stringify(out[field])} expected=${JSON.stringify(expectedVal)}`);
        ok = false;
      }
    }

    const safetyIssues = checkSafety(out.customer_reply || "");
    if (safetyIssues.length > 0) {
      console.log(`  SAFETY VIOLATION: ${safetyIssues.join(", ")}`);
      ok = false;
    }

    if (!out.customer_reply?.toLowerCase().includes("do not share your pin or otp")) {
      console.log(`  Missing PIN/OTP reminder`);
    }

    if (ok) {
      console.log(`PASS [${tc.id}] ${tc.label} (${elapsed}s)`);
      passed++;
    } else {
      failed++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed out of ${EDGE_CASES.length}`);
  console.log("=".repeat(60));
}

run().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
