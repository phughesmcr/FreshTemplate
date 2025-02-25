import type { Handlers } from "$fresh/server.ts";
import { openAIService } from "lib/openai.ts";
import { toFile } from "@openai/openai";
import type { ServerState } from "lib/middlewares/state.ts";
import { AudioTranscription } from "lib/constants.ts";

export type TranscriptionResponse = {
  text: string;
  error: string | null;
};

export const handler: Handlers<null, ServerState> = {
  async POST(req): Promise<Response> {
    const client = openAIService.getClient();
    if (!client) {
      return new Response(JSON.stringify({ text: "", error: "Transcription service unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
    try {
      const form = await req.formData();
      const file = form.get("file");
      if (!file || !(file instanceof File)) {
        return new Response(JSON.stringify({ text: "", error: "Invalid or missing file" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      const response = await client.audio.transcriptions.create({
        language: AudioTranscription.DEFAULT_LANGUAGE,
        file: await toFile(file, file.name, { type: file.type }),
        model: AudioTranscription.MODEL,
        response_format: AudioTranscription.RESPONSE_FORMAT,
      });
      return new Response(JSON.stringify({ text: response, error: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Transcription error:", error);
      return new Response(JSON.stringify({ text: "", error: "Failed to process audio" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
