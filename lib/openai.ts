import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
  organization: Deno.env.get("OPENAI_ORGANIZATION"),
  project: Deno.env.get("OPENAI_PROJECT"),
});
