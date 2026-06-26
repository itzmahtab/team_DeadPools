// Forbidden patterns in customer_reply
const FORBIDDEN_PATTERNS = [
  // PIN/OTP/password requests
  /\bpin\b/, /\botp\b/, /\bpassword\b/, /\bcard.?number\b/,
  /share your/, /provide your/, /enter your/,
  /verify (your )?(pin|otp|password)/,
  /send (us |me )?(your )?(pin|otp|password)/,

  // Unauthorized refund promises
  /we will refund/, /you will (get|receive) (a )?refund/,
  /we (will|shall|are going to) (reverse|unblock|recover)/,
  /your money (will|shall) (be returned|come back)/,
  /guaranteed refund/, /refund (is|has been) (approved|confirmed|processed)/,

  // Suspicious third parties (basic check)
  /contact (a )?(third|other|another|external)/,
  /call this number/, /visit this (website|link|url)/,
];

export const SAFE_CREDENTIAL_REMINDER = "Please do not share your PIN or OTP with anyone.";

export const SAFE_REFUND_LANGUAGE = "any eligible amount will be returned through official channels";

export function checkForbidden(text) {
  // Return list of matched forbidden patterns.
  const textLower = text.toLowerCase();
  const matches = [];
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(textLower)) {
      matches.push(pattern.source);
    }
  }
  return matches;
}

export function postProcessSafety(result, ticket) {
  // Post-process the LLM output with rule-based safety checks.
  // Fixes or flags violations. Never crashes.
  let customerReply = result.customer_reply || "";

  // 1. Ensure PIN/OTP reminder is always present
  if (!customerReply.toLowerCase().includes(SAFE_CREDENTIAL_REMINDER.toLowerCase())) {
    result.customer_reply = customerReply.trimEnd() + ` ${SAFE_CREDENTIAL_REMINDER}`;
  }

  // 2. Check for forbidden patterns
  const violations = checkForbidden(result.customer_reply);
  if (violations.length > 0) {
    // Replace the entire customer_reply with a safe fallback
    result.customer_reply =
      "Thank you for reaching out. Our support team will review your case carefully " +
      "and contact you through official channels. " +
      SAFE_CREDENTIAL_REMINDER;
    result.human_review_required = true;
    if (!result.reason_codes) {
      result.reason_codes = [];
    }
    result.reason_codes.push("safety_override_applied");
  }

  // 3. Check recommended_next_action for unauthorized promises
  const nextAction = result.recommended_next_action || "";
  const actionViolations = checkForbidden(nextAction);
  if (actionViolations.length > 0) {
    result.recommended_next_action =
      "Route to human agent for manual review. " +
      "Do not confirm any refund or action without authority.";
    result.human_review_required = true;
  }

  // 4. Phishing case: always critical + fraud_risk + human review
  if (result.case_type === "phishing_or_social_engineering") {
    result.severity = "critical";
    result.department = "fraud_risk";
    result.human_review_required = true;
  }

  // 5. Prompt injection guard: if complaint contains instruction-like text,
  //    ensure output fields are not affected by it (we already handle this
  //    via system prompt, but verify no injection leaked into ticket_id)
  result.ticket_id = ticket.ticket_id; // force correct ticket_id always

  return result;
}