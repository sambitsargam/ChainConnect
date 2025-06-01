// server.js
import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import twilio from "twilio";

import { runAgent } from "./agent.js"; // your existing agent
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

import { http, createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";

import { getOnChainTools } from "@goat-sdk/adapter-vercel-ai";
import { allora } from "@goat-sdk/plugin-allora";
import { viem as viemWalletAdapter } from "@goat-sdk/wallet-viem";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Twilio helper
const MessagingResponse = twilio.twiml.MessagingResponse;

// parse JSON bodies for /predict (Content-Type: application/json)
app.use(express.json());
// parse URL-encoded bodies for Twilio webhook (Content-Type: application/x-www-form-urlencoded)
app.use(bodyParser.urlencoded({ extended: false }));

// 1) Instantiate the Allora plugin
const alloraPlugin = allora({
  apiKey: process.env.ALLORA_API_KEY,
});

// 2) Create a raw Viem wallet client targeting Ethereum mainnet
const rawAccount = privateKeyToAccount(process.env.WALLET_PRIVATE_KEY || "");
const rawViemClient = createWalletClient({
  account: rawAccount,
  transport: http(process.env.RPC_PROVIDER_URL),
  chain: mainnet,
});

// 3) Wrap the raw Viem client in the Goat‐SDK “viem” adapter
const walletAdapter = viemWalletAdapter(rawViemClient);

let tools;
(async () => {
  // 4) Pass the wrapped adapter to getOnChainTools
  tools = await getOnChainTools({
    wallet: walletAdapter,
    plugins: [alloraPlugin],
  });
})();

/**
 * (Optional) You can still keep /predict as a standalone JSON endpoint,
 * in case you want to call it from some other service. It expects { prompt } in JSON.
 */
app.post("/predict", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "`prompt` must be a non‐empty string." });
    }

    // Use the same generateText logic here
    const result = await generateText({
      model: openai("gpt-4o-mini"),
      tools: tools,
      prompt,
      maxSteps: 5,
      onStepFinish: (evt) => {
        console.log("Tool outputs (predict):", evt.toolResults);
      },
    });

    return res.json({ text: result.text });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Something went wrong." });
  }
});

/**
 * /webhook (WhatsApp via Twilio)
 *
 * - If incoming message contains "future" OR "prediction" → run the same logic as /predict
 * - Else → run runAgent(...)
 * - If incoming message contains BOTH "future" AND "swap", reply first with the "/predict" result,
 *   then append the runAgent(...) result in the same TwiML message.
 */
app.post("/webhook", async (req, res) => {
  const incomingMsg = req.body.Body?.trim() || "";
  const from = req.body.From;
  console.log(`Incoming WhatsApp message from ${from}: "${incomingMsg}"`);

  // Lowercase for keyword checks
  const lower = incomingMsg.toLowerCase();
  const hasFuture = lower.includes("future");
  const hasPrediction = lower.includes("prediction");
  const hasSwap = lower.includes("swap");

  // Prepare a Twilio MessagingResponse
  const twiml = new MessagingResponse();

  try {
    // Case A: contains both "future" AND "swap"
    if (hasFuture && hasSwap) {
      // 1) First run /predict logic
      const predictResult = await generateText({
        model: openai("gpt-4o-mini"),
        tools: tools,
        prompt: incomingMsg,
        maxSteps: 5,
        onStepFinish: (evt) => {
          console.log("Tool outputs (predict part):", evt.toolResults);
        },
      });

      // 2) Then run runAgent(...)
      const agentResult = await runAgent(incomingMsg);

      // Combine both responses into one Twilio reply (separated by a line break)
      twiml.message(`🔮 Prediction result:\n${predictResult.text}\n\n🤖 Agent result:\n${agentResult}`);
      res.writeHead(200, { "Content-Type": "text/xml" });
      return res.end(twiml.toString());
    }

    // Case B: contains "future" OR "prediction" (but not both swap+future)
    if (hasFuture || hasPrediction) {
      const predictResult = await generateText({
        model: openai("gpt-4o-mini"),
        tools: tools,
        prompt: incomingMsg,
        maxSteps: 5,
        onStepFinish: (evt) => {
          console.log("Tool outputs (predict):", evt.toolResults);
        },
      });
      twiml.message(predictResult.text);
      res.writeHead(200, { "Content-Type": "text/xml" });
      return res.end(twiml.toString());
    }

    // Case C: neither "future" nor "prediction"
    // Just run the existing agent
    const agentResponse = await runAgent(incomingMsg);
    twiml.message(agentResponse);
    res.writeHead(200, { "Content-Type": "text/xml" });
    return res.end(twiml.toString());

  } catch (err) {
    console.error("Webhook handler error:", err);
    twiml.message("Oops! Something went wrong. Please try again later.");
    res.writeHead(200, { "Content-Type": "text/xml" });
    return res.end(twiml.toString());
  }
});

// Health check
app.get("/", (req, res) => {
  res.send("WhatsApp AI Agent is running.");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
