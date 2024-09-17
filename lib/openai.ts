import { IS_BROWSER } from "$fresh/runtime.ts";
import OpenAI from "openai";

export const openai = IS_BROWSER ? null : new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
  organization: Deno.env.get("OPENAI_ORGANIZATION"),
  project: Deno.env.get("OPENAI_PROJECT"),
});
