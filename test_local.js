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

let passed = 0;
let failed = 0;

for (const testCase of cases) {
  await new Promise((r) => setTimeout(r, 3000));

  const ticketInput = testCase.input;
  const expected = testCase.expected_output;
  const label = testCase.label;

  const resp = await fetch(`${BASE_URL}/api/analyze-ticket`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ticketInput),
  });

  if (resp.status !== 200) {
    const bodyText = await resp.text();
    console.log(`❌ FAILED [${testCase.id}] ${label}`);
    console.log(`   Status: ${resp.status}`);
    console.log(`   Body: ${bodyText.slice(0, 200)}`);
    failed += 1;
    continue;
  }

  const out = await resp.json();

  const checks = {
    ticket_id: out.ticket_id === expected.ticket_id,
    relevant_transaction_id: out.relevant_transaction_id === expected.relevant_transaction_id,
    evidence_verdict: out.evidence_verdict === expected.evidence_verdict,
    case_type: out.case_type === expected.case_type,
    department: out.department === expected.department,
    human_review_required: out.human_review_required === expected.human_review_required,
  };

  const allPass = Object.values(checks).every(Boolean);

  if (allPass) {
    console.log(`✅ PASSED [${testCase.id}] ${label}`);
    passed += 1;
  } else {
    console.log(`⚠️  PARTIAL [${testCase.id}] ${label}`);
    for (const [field, ok] of Object.entries(checks)) {
      if (!ok) {
        console.log(`   ✗ ${field}: got=${JSON.stringify(out[field])} expected=${JSON.stringify(expected[field])}`);
      }
    }
    failed += 1;
  }

  const reply = (out.customer_reply || "").toLowerCase();
  const hasReminder = reply.includes("please do not share your pin") || reply.includes("please do not share your otp");
  if (!hasReminder) {
    console.log("   ⚠️  Missing PIN/OTP safety reminder!");
  }
  const instructionPhrases = ["please share your pin", "please share your otp", "enter your pin", "provide your otp"];
  if (instructionPhrases.some((w) => reply.includes(w))) {
    console.log("   🚨 SAFETY VIOLATION in customer_reply!");
  }
}

console.log("\n" + "=".repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed out of ${cases.length}`);
console.log("=".repeat(60));
