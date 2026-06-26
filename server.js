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
    const validated = TicketResponse.parse(result); // guarantees shape before sending
    res.json(validated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error. Please try again." });
  }
});

// Global JSON parse / malformed body handler (must come after routes)
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