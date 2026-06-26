import { TicketRequest, TicketResponse } from "@/lib/schemas.js";
import { analyzeTicket } from "@/lib/analyzer.js";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return Response.json(
      { error: "Malformed JSON body." },
      { status: 400 }
    );
  }

  const parsed = TicketRequest.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "Invalid request body", details: parsed.error.issues },
      { status: 422 }
    );
  }

  try {
    const result = await analyzeTicket(parsed.data);
    const validated = TicketResponse.parse(result);
    return Response.json(validated);
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: "Internal server error. Please try again." },
      { status: 500 }
    );
  }
}
