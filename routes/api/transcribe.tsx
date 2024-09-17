import type { Handlers } from "$fresh/server.ts";
import { openai } from "lib/openai.ts";
import { toFile } from "openai";

export type TranscriptionResponse = {
  text: string;
  error: string | null;
};

export const handler: Handlers<null, ServerState> = {
  async POST(req): Promise<Response> {
    if (!openai) {
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
      const response = await openai.audio.transcriptions.create({
        language: "en",
        file: await toFile(file, file.name, { type: file.type }),
        model: "whisper-1",
        response_format: "text",
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
