import "server-only";
import { z } from "zod";
import { db, aiUsage } from "@/db";

/**
 * Provider-agnostic AI client using the OpenAI-compatible Chat Completions API.
 * Works with Google Gemini (free tier), Groq, OpenRouter, Ollama, OpenAI, etc.
 *   AI_API_KEY   – provider key (required unless AI_PROVIDER=mock)
 *   AI_BASE_URL  – default: Gemini's OpenAI-compatible endpoint
 *   AI_MODEL     – default: gemini-flash-latest
 *   AI_PROVIDER=mock – canned answers, for demos/tests without a key
 */
const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/";

export const aiConfig = () => ({
  mock: process.env.AI_PROVIDER === "mock" && !process.env.AI_API_KEY,
  key: process.env.AI_API_KEY || "",
  base: (process.env.AI_BASE_URL || DEFAULT_BASE).replace(/\/?$/, "/"),
  model: process.env.AI_MODEL || "gemini-flash-latest",
});
export const aiEnabled = () => { const c = aiConfig(); return c.mock || !!c.key; };

export class AiError extends Error {}

// simple per-user rate limit (protects the free-tier quota)
const hits = new Map<number, number[]>();
function rateLimit(userId: number, perMin = Number(process.env.AI_RATE_PER_MIN || 12)) {
  const now = Date.now();
  const arr = (hits.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (arr.length >= perMin) throw new AiError("You're going a bit fast — try again in a minute.");
  arr.push(now);
  hits.set(userId, arr);
}

export type Msg =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ToolDef = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };

async function log(feature: string, userId: number | null, t0: number, ok: boolean, usage?: { prompt_tokens?: number; completion_tokens?: number }, error?: string) {
  try {
    await db.insert(aiUsage).values({ feature, userId, ok, ms: Date.now() - t0, promptTokens: usage?.prompt_tokens ?? 0, completionTokens: usage?.completion_tokens ?? 0, error: error?.slice(0, 500) });
  } catch {}
}

async function callApi(body: Record<string, unknown>) {
  const c = aiConfig();
  const res = await fetch(`${c.base}chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.key}` },
    body: JSON.stringify({ model: c.model, ...body }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    if (res.status === 429) throw new AiError("The AI provider's free quota is used up for now. Try again later.");
    if (res.status === 401 || res.status === 403) throw new AiError("AI key was rejected — check AI_API_KEY in .env.");
    throw new AiError(`AI request failed (${res.status}). ${txt.slice(0, 200)}`);
  }
  return (await res.json()) as { choices: { message: { content: string | null; tool_calls?: ToolCall[] } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
}

function extractJson(s: string) {
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1]! : s;
  const start = raw.search(/[[{]/);
  const end = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
  return JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
}

/** Ask for JSON matching `schema`. Retries once with the validation error. */
export async function aiJson<T>(opts: { feature: string; userId: number | null; system: string; prompt: string; schema: z.ZodType<T>; mock: () => T; temperature?: number }): Promise<T> {
  if (!aiEnabled()) throw new AiError("AI is not set up yet — add AI_API_KEY to .env (see README).");
  if (opts.userId) rateLimit(opts.userId);
  const t0 = Date.now();
  if (aiConfig().mock) {
    await new Promise((r) => setTimeout(r, 150));
    const v = opts.schema.parse(opts.mock());
    await log(opts.feature, opts.userId, t0, true);
    return v;
  }
  const messages: Msg[] = [
    { role: "system", content: `${opts.system}\n\nRespond with ONLY a JSON object, no prose, no markdown fences.` },
    { role: "user", content: opts.prompt },
  ];
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await callApi({ messages, temperature: opts.temperature ?? 0.3, response_format: { type: "json_object" } });
      const content = r.choices[0]?.message.content ?? "";
      const parsed = opts.schema.safeParse(extractJson(content));
      if (parsed.success) {
        await log(opts.feature, opts.userId, t0, true, r.usage);
        return parsed.data;
      }
      lastErr = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      messages.push({ role: "assistant", content }, { role: "user", content: `That JSON was invalid (${lastErr}). Reply again with corrected JSON only.` });
    } catch (e) {
      if (e instanceof AiError) { await log(opts.feature, opts.userId, t0, false, undefined, e.message); throw e; }
      lastErr = (e as Error).message;
    }
  }
  await log(opts.feature, opts.userId, t0, false, undefined, lastErr);
  throw new AiError("The AI returned something unexpected. Please try again.");
}

/** Chat with tool-calling loop. `run` executes a tool and returns JSON-serialisable data. */
export async function aiChatWithTools(opts: {
  feature: string; userId: number; messages: Msg[]; tools: ToolDef[];
  run: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  mock: (question: string) => Promise<string>;
  maxSteps?: number;
}): Promise<string> {
  if (!aiEnabled()) throw new AiError("AI is not set up yet — add AI_API_KEY to .env (see README).");
  rateLimit(opts.userId);
  const t0 = Date.now();
  if (aiConfig().mock) {
    const q = [...opts.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const a = await opts.mock(String(q));
    await log(opts.feature, opts.userId, t0, true);
    return a;
  }
  const msgs = [...opts.messages];
  let tokens = { prompt_tokens: 0, completion_tokens: 0 };
  for (let step = 0; step < (opts.maxSteps ?? 5); step++) {
    const r = await callApi({ messages: msgs, tools: opts.tools, temperature: 0.2 }).catch(async (e) => {
      await log(opts.feature, opts.userId, t0, false, tokens, (e as Error).message);
      throw e;
    });
    tokens = { prompt_tokens: tokens.prompt_tokens + (r.usage?.prompt_tokens ?? 0), completion_tokens: tokens.completion_tokens + (r.usage?.completion_tokens ?? 0) };
    const m = r.choices[0]!.message;
    if (!m.tool_calls?.length) {
      await log(opts.feature, opts.userId, t0, true, tokens);
      return m.content ?? "";
    }
    msgs.push({ role: "assistant", content: m.content ?? null, tool_calls: m.tool_calls });
    for (const tc of m.tool_calls) {
      let out: unknown;
      try { out = await opts.run(tc.function.name, JSON.parse(tc.function.arguments || "{}")); }
      catch (e) { out = { error: (e as Error).message }; }
      msgs.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(out).slice(0, 12_000) });
    }
  }
  await log(opts.feature, opts.userId, t0, false, tokens, "too many steps");
  throw new AiError("That question needed too many lookups — try asking something more specific.");
}

export const aiErrorMessage = (e: unknown) => (e instanceof AiError ? e.message : "Something went wrong with the AI request.");
