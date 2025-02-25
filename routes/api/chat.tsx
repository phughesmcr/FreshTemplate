import type { Handlers } from "$fresh/server.ts";
import { openAIService } from "lib/openai.ts";
import type { OpenAI as OpenAIType } from "@openai/openai";
import { HttpStatus, OpenAI } from "lib/constants.ts";

export interface ChatRequest {
  messages: OpenAIType.Chat.Completions.ChatCompletionMessageParam[];
}

export type ChatResponse = {
  text: string;
  error: string | null;
};

/**
 * Creates a response with standardized format and headers
 */
function createJsonResponse(
  data: ChatResponse,
  status: number,
): Response {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

/**
 * Creates an error response with consistent format
 */
function createErrorResponse(
  error: string,
  status: number = HttpStatus.BAD_REQUEST,
): Response {
  return createJsonResponse({ text: "", error }, status);
}

export const handler: Handlers<ChatRequest | null> = {
  async POST(req, _ctx): Promise<Response> {
    try {
      // Check if OpenAI service is available
      if (!openAIService || !openAIService.isConfigured()) {
        return createErrorResponse("Chat completion service unavailable", HttpStatus.SERVICE_UNAVAILABLE);
      }

      // Parse request
      let messages: OpenAIType.Chat.Completions.ChatCompletionMessageParam[];
      try {
        const body = await req.json();
        messages = body.messages;
      } catch (error) {
        return createErrorResponse(
          `Invalid request format: ${error instanceof Error ? error.message : String(error)}`,
          HttpStatus.BAD_REQUEST,
        );
      }

      // Validate messages
      if (!messages || !Array.isArray(messages)) {
        return createErrorResponse("Messages must be provided as an array", HttpStatus.BAD_REQUEST);
      }

      if (messages.length === 0) {
        return createErrorResponse("At least one message must be provided", HttpStatus.BAD_REQUEST);
      }

      if (messages[0].role !== "system") {
        return createErrorResponse("First message must have 'system' role", HttpStatus.BAD_REQUEST);
      }

      if (messages[messages.length - 1].role === "system") {
        return createErrorResponse("Last message cannot have 'system' role", HttpStatus.BAD_REQUEST);
      }

      // Handle based on last message role
      const lastMessage = messages[messages.length - 1];

      // Handle user message - generate AI response
      if (lastMessage.role === "user") {
        try {
          const client = openAIService.getClient();
          const response = await client.chat.completions.create({
            messages,
            max_tokens: OpenAI.MAX_TOKENS,
            temperature: OpenAI.TEMPERATURE,
            model: OpenAI.MODEL,
          });

          if (!response) {
            return createErrorResponse("No response from OpenAI", HttpStatus.SERVICE_UNAVAILABLE);
          }

          if (response.choices[0]?.finish_reason !== "stop") {
            console.error("Incomplete response:", response.choices[0]?.finish_reason);
            return createErrorResponse("Chat completion was interrupted", HttpStatus.INTERNAL_SERVER_ERROR);
          }

          const responseText = response.choices[0]?.message?.content || "";
          return createJsonResponse({ text: responseText, error: null }, HttpStatus.OK);
        } catch (error) {
          console.error("OpenAI API error:", error);
          return createErrorResponse(
            `Error processing OpenAI request: ${error instanceof Error ? error.message : String(error)}`,
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      }

      // Handle assistant message (currently not implemented)
      if (lastMessage.role === "assistant") {
        // TODO: Implement assistant message handling (like validating AI responses)
        return createErrorResponse("Assistant message handling not implemented", HttpStatus.NOT_IMPLEMENTED);
      }

      // If we get here, the message role is not supported
      return createErrorResponse(`Unsupported message role: ${lastMessage.role}`, HttpStatus.BAD_REQUEST);
    } catch (error) {
      console.error("Unexpected server error:", error);
      return createErrorResponse(
        `Server error: ${error instanceof Error ? error.message : String(error)}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  },
};
