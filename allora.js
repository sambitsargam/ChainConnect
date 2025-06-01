// server.js
import express from "express";
import dotenv from "dotenv";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { allora } from "@goat-sdk/plugin-allora";

dotenv.config();

const app = express();
app.use(express.json());

// 1. Instantiate the Allora plugin with your API key
//    (make sure ALLORA_API_KEY is defined in your environment)
const alloraPlugin = allora({
  apiKey: process.env.ALLORA_API_KEY, 
});

// 2. A simple POST /chat endpoint that takes { prompt: string } in the body
//    and runs generateText with just the Allora plugin as a “tool”.
app.post("/chat", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (typeof prompt !== "string" || prompt.trim().length === 0) {
      return res.status(400).json({ error: "Body must include a nonempty `prompt` field." });
    }

    // 3. Call generateText with GPT-4o-Mini (or another model), passing only Allora as a tool.
    const result = await generateText({
      model: openai("gpt-4o-mini"),
      tools: [alloraPlugin],
      prompt,
      maxSteps: 5, // adjust as needed
      onStepFinish: (event) => {
        // (optional) log intermediate tool outputs
        console.log("Tool results this step:", event.toolResults);
      },
    });

    // 4. Send back the final text to the client
    return res.json({ text: result.text });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Something went wrong." });
  }
});

// 5. Start the server on port 3000 (or adjust as needed)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
