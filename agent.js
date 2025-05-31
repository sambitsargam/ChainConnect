import { ChatAnthropic } from "@langchain/anthropic";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import {
    Aptos,
    AptosConfig,
    Ed25519PrivateKey,
    Network,
    PrivateKey,
    PrivateKeyVariants,
} from "@aptos-labs/ts-sdk";
import { AgentRuntime, LocalSigner, createAptosTools } from "move-agent-kit";
import dotenv from "dotenv";
dotenv.config();

const aptosConfig = new AptosConfig({ network: Network.MAINNET });
const aptos = new Aptos(aptosConfig);

const memory = new MemorySaver();

const llm = new ChatAnthropic({
    temperature: 0.7,
    model: "claude-3-5-sonnet-latest",
    apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function createAgent() {
    const privateKeyStr = process.env.APTOS_PRIVATE_KEY;
    const privateKey = new Ed25519PrivateKey(
        PrivateKey.formatPrivateKey(privateKeyStr, PrivateKeyVariants.Ed25519)
    );
    const account = await aptos.deriveAccountFromPrivateKey({ privateKey });
    const signer = new LocalSigner(account, Network.MAINNET);
    const aptosAgent = new AgentRuntime(signer, aptos, {
        PANORA_API_KEY: "a4^KV_EaTf4MW#ZdvgGKX#HUD^3IFEAOV_kzpIE^3BQGA8pDnrkT7JcIy#HNlLGi",
    });

    const tools = createAptosTools(aptosAgent);

    return createReactAgent({
        llm,
        tools,
        checkpointSaver: memory,
        messageModifier: `
 You are a helpful agent that can interact onchain using the Aptos Agent Kit. You are
        empowered to interact onchain using your tools. If you ever need funds, you can request them from the
        faucet. If not, you can provide your wallet details and request funds from the user. If there is a 5XX
        (internal) HTTP error code, ask the user to try again later. If someone asks you to do something you
        can't do with your currently available tools, you must say so, and encourage them to implement it
        themselves using the Aptos Agent Kit, recommend they go to https://www.aptosagentkit.xyz for more information. Be
        concise and helpful with your responses. Refrain from restating your tools' descriptions unless it is explicitly requested.

		The response also contains token/token[] which contains the name and address of the token and the decimals.
		WHEN YOU RETURN ANY TOKEN AMOUNTS, RETURN THEM ACCORDING TO THE DECIMALS OF THE TOKEN.`,
    });
}

export async function runAgent(userInput) {
    const agent = await createAgent();
   const result = await agent.invoke(
    {
      messages: [{ role: "user", content: userInput }],
    },
    {
      version: "v2",
      configurable: {
        thread_id: `user-${Date.now()}`, // 🆕 required field
      },
    }
  );
    return result.messages.at(-1)?.content || "Sorry, I couldn't understand that.";
}
