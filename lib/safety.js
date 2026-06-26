const PHISHING_KEYWORDS = [
  /called.*(?:support|bKash|bank|agent)/i,
  /(?:asked|ask).*(?:OTP|PIN|password)/i,
  /(?:OTP|PIN).*(?:share|send|give)/i,
  /claiming.*(?:bKash|support|bank)/i,
  /impersonat/i,
];

const FORBIDDEN_PATTERNS = [
  /\bshare your (pin|otp|password|card.?number)\b/i,
  /\bprovide your (pin|otp|password|card.?number)\b/i,
  /\benter your (pin|otp|password|card.?number)\b/i,
  /\bverify (your )?(pin|otp|password)\b/i,
  /\bsend (us |me )?(your )?(pin|otp|password)\b/i,
  /\bwe will refund\b/i,
  /\byou will (get|receive) (a )?refund\b/i,
  /\bwe (will|shall|are going to) (reverse|unblock|recover)\b/i,
  /\byour money (will|shall) (be returned|come back)\b/i,
  /\bguaranteed refund\b/i,
  /\brefund (is|has been) (approved|confirmed|processed)\b/i,
  /\bcontact (a )?(third|other|another|external)\b/i,
  /\bcall this number\b/i,
  /\bvisit this (website|link|url)\b/i,
  /\byour pin is\b/i,
  /\byour otp is\b/i,
];

export const SAFE_CREDENTIAL_REMINDER = "Please do not share your PIN or OTP with anyone.";
export const SAFE_REFUND_LANGUAGE = "any eligible amount will be returned through official channels";

export function checkForbidden(text) {
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
  let customerReply = result.customer_reply || "";

  if (!customerReply.toLowerCase().includes(SAFE_CREDENTIAL_REMINDER.toLowerCase())) {
    result.customer_reply = customerReply.trimEnd() + ` ${SAFE_CREDENTIAL_REMINDER}`;
  }

  const violations = checkForbidden(result.customer_reply);
  if (violations.length > 0) {
    result.customer_reply =
      "Thank you for reaching out. Our support team will review your case carefully " +
      "and contact you through official channels. " +
      SAFE_CREDENTIAL_REMINDER;
    result.human_review_required = true;
    if (!result.reason_codes) result.reason_codes = [];
    result.reason_codes.push("safety_override_applied");
  }

  const nextAction = result.recommended_next_action || "";
  const actionViolations = checkForbidden(nextAction);
  if (actionViolations.length > 0) {
    result.recommended_next_action =
      "Route to human agent for manual review. " +
      "Do not confirm any refund or action without authority.";
    result.human_review_required = true;
  }

  const complaint = (ticket.complaint || "").toLowerCase();
  const isPhishingKeyword = PHISHING_KEYWORDS.some((p) => p.test(complaint));
  if (isPhishingKeyword && result.case_type !== "phishing_or_social_engineering") {
    result.case_type = "phishing_or_social_engineering";
    result.human_review_required = true;
    if (!result.reason_codes) result.reason_codes = [];
    result.reason_codes.push("phishing_keyword_override");
  }

  if (result.case_type === "phishing_or_social_engineering") {
    result.severity = "critical";
    result.department = "fraud_risk";
    result.human_review_required = true;
  }

  result.ticket_id = ticket.ticket_id;
  return result;
}
