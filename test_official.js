import fs from "fs";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const DELAY_MS = 2000;
const data = JSON.parse(fs.readFileSync("./sample_cases.json", "utf-8"));
const cases = data.cases;

const FIELD_CHECKS = [
  "ticket_id",
  "relevant_transaction_id",
  "evidence_verdict",
  "case_type",
  "severity",
  "department",
  "human_review_required",
];

const REQUIRED_RESPONSE_FIELDS = [
  "ticket_id",
  "relevant_transaction_id",
  "evidence_verdict",
  "case_type",
  "severity",
  "department",
  "agent_summary",
  "recommended_next_action",
  "customer_reply",
  "human_review_required",
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log("=".repeat(60));
  console.log(`Official Sample Cases — ${cases.length} tests`);
  console.log(`Endpoint: ${BASE_URL}/api/analyze-ticket`);
  console.log("=".repeat(60));

  const health = await fetch(`${BASE_URL}/api/health`);
  const healthBody = await health.json();
  if (healthBody.status !== "ok") throw new Error("Health check failed");
  console.log("Health OK\n");

  let passed = 0;
  let failed = 0;

  for (const tc of cases) {
    await sleep(DELAY_MS);

    const start = Date.now();
    const resp = await fetch(`${BASE_URL}/api/analyze-ticket`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tc.input),
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    if (resp.status !== 200) {
      const body = await resp.text();
      console.log(`FAIL [${tc.id}] ${tc.label} (${elapsed}s)`);
      console.log(`  HTTP ${resp.status}: ${body.slice(0, 150)}`);
      failed++;
      continue;
    }

    const out = await resp.json();
    const exp = tc.expected_output;
    const fieldResults = {};

    for (const field of FIELD_CHECKS) {
      fieldResults[field] = out[field] === exp[field];
    }

    const allFieldsPass = Object.values(fieldResults).every(Boolean);

    const missingFields = REQUIRED_RESPONSE_FIELDS.filter((f) => !out[f] && out[f] !== null);

    const replyHasReminder = (out.customer_reply || "")
      .toLowerCase()
      .includes("do not share your pin or otp");

    const hasRationale = !!out.rationale;

    if (allFieldsPass && missingFields.length === 0 && replyHasReminder && hasRationale) {
      console.log(`PASS [${tc.id}] ${tc.label} (${elapsed}s)`);
      passed++;
    } else {
      console.log(`PARTIAL [${tc.id}] ${tc.label} (${elapsed}s)`);
      for (const [field, ok] of Object.entries(fieldResults)) {
        if (!ok) {
          console.log(`  ${field}: got=${JSON.stringify(out[field])} expected=${JSON.stringify(exp[field])}`);
        }
      }
      if (missingFields.length > 0) {
        console.log(`  Missing fields: ${missingFields.join(", ")}`);
      }
      if (!replyHasReminder) {
        console.log(`  Missing PIN/OTP safety reminder`);
      }
      if (!hasRationale) {
        console.log(`  Missing rationale`);
      }
      failed++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed out of ${cases.length}`);
  console.log("=".repeat(60));
}

run().catch((err) => {
  console.error("Test runner error:", err);
  process.exit(1);
});
