import type { Handlers } from "$fresh/server.ts";
import { openai } from "lib/openai.ts";

/**
 * @module voicesynth
 * @description This module provides a way to interact with the OpenAI TTS API.
 */

/** The type of voices available for synthesis. */
export type VoiceType =
  | "alloy"
  | "echo"
  | "fable"
  | "onyx"
  | "nova"
  | "shimmer";

/** The list of voices available for synthesis. */
export const voiceTypes: VoiceType[] = [
  "alloy",
  "echo",
  "fable",
  "onyx",
  "nova",
  "shimmer",
] as const;

/** The default voice to use for synthesis. */
export const DEFAULT_VOICE: VoiceType = "alloy";

/** The default TTS model to use for synthesis. */
export const DEFAULT_VOICE_MODEL: string = "tts-1";

/** The request object for the voice synthesis API. */
export interface VoiceSynthRequest {
  /** The text of the message to be synthesized. */
  message: string;
  /**
   * The voice to use for synthesis.
   * @default "alloy"
   */
  voice?: VoiceType;
}

/** The response object for the voice synthesis API. */
export type VoiceSynthResponse = {
  audio: string;
  error: string | null;
};

/** Type guard to check if a voice is valid. */
export const isValidVoice = (voice: string): voice is VoiceType => voiceTypes.includes(voice as VoiceType);

/** Type guard to check if a voice synthesis request is valid. */
export const isValidVoiceSynthRequest = (
  req: VoiceSynthRequest,
): req is VoiceSynthRequest => {
  return typeof req.message === "string" && req.message.trim().length > 0 &&
    (req.voice === undefined ||
      (typeof req.voice === "string" && isValidVoice(req.voice)));
};

export const responseToBase64 = async (response: Response): Promise<string> => {
  const audioBuffer = await response.arrayBuffer();
  return encodeBase64(new Uint8Array(audioBuffer));
};

/** The route handler for the voice synthesis API. */
export const handler: Handlers<VoiceSynthRequest | null, unknown> = {
  async POST(req, _ctx) {
    if (!openai || !openai.audio || !openai.audio.speech) {
      return new Response(JSON.stringify({ error: "Voice synthesis service unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
    try {
      const props = await req.json() as VoiceSynthRequest;

      if (!isValidVoiceSynthRequest(props)) {
        return new Response(
          JSON.stringify({ error: "Invalid voice synthesis request." }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      props.voice = props.voice || DEFAULT_VOICE;
      const voice: VoiceType = isValidVoice(props.voice) ? props.voice : DEFAULT_VOICE;

      const audioResponse = await openai.audio.speech.create({
        model: DEFAULT_VOICE_MODEL,
        voice: voice.toLowerCase().trim() as VoiceType,
        input: props.message,
        response_format: "opus",
      });

      if (!audioResponse) {
        return new Response(
          JSON.stringify({ error: "No response from speech service" }),
          {
            status: 500,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response(audioResponse.body, {
        status: 200,
        headers: {
          "Content-Type": "audio/opus",
          "Transfer-Encoding": "chunked",
        },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({ error: error.message ?? "An error occurred during voice synthesis" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  },
};
