import type { Handlers } from "$fresh/server.ts";
import { openai } from "lib/openai.ts";
import type { OpenAI } from "openai";

export interface ChatRequest {
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
}

export type ChatResponse = {
  text: string;
  error: string | null;
};

const MODEL = "gpt-4o-mini";
const MAX_TOKENS = 1028;
const TEMPERATURE = 0.1;

export const handler: Handlers<ChatRequest | null> = {
  async POST(req, _ctx): Promise<Response> {
    try {
      if (!openai) {
        return new Response(JSON.stringify({ text: "", error: "Transcription service unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }

      const { messages } = await req.json();
      console.log("Received messages:", messages);

      if (!messages || !Array.isArray(messages)) {
        return new Response(JSON.stringify({ text: "", error: "No messages" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (!messages.length) {
        return new Response(JSON.stringify({ text: "", error: "No message length" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (messages[0].role !== "system") {
        return new Response(JSON.stringify({ text: "", error: "First message must be system" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (messages[messages.length - 1].role === "system") {
        return new Response(JSON.stringify({ text: "", error: "Last message cannot be system" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      // messages[0].content = systemPrompt;

      // respond to user
      if (messages[messages.length - 1].role === "user") {
        try {
          const response = await openai?.chat.completions.create({
            messages: messages,
            max_tokens: MAX_TOKENS,
            temperature: TEMPERATURE,
            model: MODEL,
          });
          if (!response) {
            return new Response(JSON.stringify({ text: "", error: "No response from OpenAI" }), {
              status: 503,
              headers: { "Content-Type": "application/json" },
            });
          }
          // partial response
          if (response.choices[0]?.finish_reason !== "stop") {
            // TODO: handle partial response properly
            console.error("Chat did not complete successfully:", response.choices[0]?.finish_reason);
            throw new Error("Chat did not complete successfully");
          }
          // success
          const responseText = response.choices[0]?.message?.content || "";
          return new Response(JSON.stringify({ text: responseText, error: null }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          return new Response(JSON.stringify({ text: "", error: `Error processing request: ${error.message}` }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      // respond to assistant
      if (messages[messages.length - 1].role === "assistant") {
        return new Response(JSON.stringify({ text: "", error: "Assistant message handling not implemented" }), {
          status: 501,
          headers: { "Content-Type": "application/json" },
        });
      }

      // return null if no response
      return new Response(JSON.stringify({ text: "", error: "Invalid response" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      return new Response(JSON.stringify({ text: "", error: `Server error: ${error.message}` }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
