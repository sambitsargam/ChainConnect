import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { MessagingResponse } from "twilio";
import { runAgent } from "./agent.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));

app.post("/webhook", async (req, res) => {
  const incomingMsg = req.body.Body;
  const from = req.body.From;

  console.log(`Incoming message from ${from}: ${incomingMsg}`);

  try {
    const reply = await runAgent(incomingMsg);
    const twiml = new MessagingResponse();
    twiml.message(reply);
    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(twiml.toString());
  } catch (err) {
    console.error("Agent error:", err);
    const twiml = new MessagingResponse();
    twiml.message("Oops! Something went wrong. Please try again later.");
    res.writeHead(200, { "Content-Type": "text/xml" });
    res.end(twiml.toString());
  }
});

app.get("/", (req, res) => {
  res.send("WhatsApp AI Agent is running.");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
