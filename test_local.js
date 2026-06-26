import fs from "fs";

const BASE_URL = "http://localhost:3000";

const data = JSON.parse(fs.readFileSync("./sample_cases.json", "utf-8"));
const cases = data.cases;

console.log("=".repeat(60));
console.log(`Testing ${cases.length} sample cases against ${BASE_URL}`);
console.log("=".repeat(60));

const healthRes = await fetch(`${BASE_URL}/api/health`);
const healthBody = await healthRes.json();
if (JSON.stringify(healthBody) !== JSON.stringify({ status: "ok" })) {
  throw new Error("HEALTH CHECK FAILED");
}
console.log("✅ /api/health OK\n");

const CHECK_FIELDS = [
  "ticket_id",
  "relevant_transaction_id",
  "evidence_verdict",
  "case_type",
  "severity",
  "department",
  "human_review_required",
];

const REQUIRED_FIELDS = [
  "ticket_id", "relevant_transaction_id",
  "evidence_verdict", "case_type", "severity", "department",
  "agent_summary", "recommended_next_action", "customer_reply",
  "human_review_required",
];

let passed = 0;
let failed = 0;

for (const tc of cases) {
  await new Promise((r) => setTimeout(r, 5000));

  const resp = await fetch(`${BASE_URL}/api/analyze-ticket`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tc.input),
  });

  if (resp.status !== 200) {
    const bodyText = await resp.text();
    console.log(`❌ FAILED [${tc.id}] ${tc.label}`);
    console.log(`   Status: ${resp.status}`);
    console.log(`   Body: ${bodyText.slice(0, 200)}`);
    failed++;
    continue;
  }

  const out = await resp.json();
  const exp = tc.expected_output;

  const fieldResults = {};
  for (const f of CHECK_FIELDS) {
    fieldResults[f] = out[f] === exp[f];
  }

  const allPass = Object.values(fieldResults).every(Boolean);
  const missingReq = REQUIRED_FIELDS.filter((f) => !out[f] && out[f] !== null);
  const hasReminder = (out.customer_reply || "").toLowerCase().includes("do not share your pin or otp");

  if (allPass && missingReq.length === 0 && hasReminder) {
    console.log(`✅ PASSED [${tc.id}] ${tc.label}`);
    passed++;
  } else {
    console.log(`PARTIAL [${tc.id}] ${tc.label}`);
    for (const [f, ok] of Object.entries(fieldResults)) {
      if (!ok) console.log(`  ${f}: got=${JSON.stringify(out[f])} expected=${JSON.stringify(exp[f])}`);
    }
    if (missingReq.length > 0) console.log(`  Missing fields: ${missingReq.join(", ")}`);
    if (!hasReminder) console.log(`  Missing PIN/OTP safety reminder`);
    failed++;
  }
}

console.log("\n" + "=".repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed out of ${cases.length}`);
console.log("=".repeat(60));
