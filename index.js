import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { runAgent } from "./agent.js";
import twilio from "twilio";
import express from "express";
import dotenv from "dotenv";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

import { http, createWalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";

import { getOnChainTools } from "@goat-sdk/adapter-vercel-ai";
import { allora } from "@goat-sdk/plugin-allora";
import { viem as viemWalletAdapter } from "@goat-sdk/wallet-viem";

const MessagingResponse = twilio.twiml.MessagingResponse;


dotenv.config();

app.use(express.json());

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.urlencoded({ extended: false }));


// 1) Instantiate the Allora plugin
const alloraPlugin = allora({
  apiKey: process.env.ALLORA_API_KEY,
});

// 2) Create a raw Viem wallet client, now targeting Ethereum mainnet
const rawAccount = privateKeyToAccount(process.env.WALLET_PRIVATE_KEY || "");
const rawViemClient = createWalletClient({
  account: rawAccount,
  transport: http(process.env.RPC_PROVIDER_URL),
  chain: mainnet,            // ← use mainnet here
});

// 3) Wrap the raw Viem client in the Goat‐SDK “viem” adapter
const walletAdapter = viemWalletAdapter(rawViemClient);

let tools;
(async () => {
  // 4) Pass the wrapped adapter (not the raw client) to getOnChainTools
  tools = await getOnChainTools({
    wallet: walletAdapter,
    plugins: [alloraPlugin],
  });
})();

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

app.post("/predict", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "`prompt` must be a non‐empty string." });
    }

    // 5) Now `tools` contains valid Tool objects (each with its Zod schema)
    const result = await generateText({
      model: openai("gpt-4o-mini"),
      tools: tools,
      prompt: prompt,
      maxSteps: 5,
      onStepFinish: (evt) => {
        console.log("Tool outputs:", evt.toolResults);
      },
    });

    return res.json({ text: result.text });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Something went wrong." });
  }
});

app.get("/", (req, res) => {
  res.send("WhatsApp AI Agent is running.");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
