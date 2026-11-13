// supabase/functions/_shared/ai-groq-client.ts
// Phase 3 (2026-11-13): Groq OpenAI-compatible client for the Adapter.
//
// Endpoint: POST {baseUrl}/chat/completions (verified in
// AI-PROVIDER-VERIFICATION.md §5: base `https://api.groq.com/openai/v1`,
// model `openai/gpt-oss-120b`, `tool_choice: "required"`, strict
// structured outputs supported on this model). The request shape is the
// same OpenAI-compatible shape the pre-migration code used, so the
// migration is a URL + key change for this provider — the tool schemas
// are carried over byte-for-byte (no `strict: true` is added: the
// existing schemas use `type: ["string", "null"]` in one place, which
// strict mode may reject; the Adapter validates the parsed args
// server-side instead).
//
// The 429 rate-limit headers (`x-ratelimit-remaining-requests`,
// `x-ratelimit-remaining-tokens`, `x-ratelimit-reset-requests`,
// `x-ratelimit-reset-tokens`, `retry-after`) are extracted here and
// returned with the outcome — the Adapter classifies the 429 from them
// (failover §1a). Like the Gemini client, this client never throws for
// an HTTP error; it returns the raw outcome and the Adapter classifies.

import { AI_CONFIG } from "./ai-config.ts";
import type { ProviderUsage, ToolDefinition } from "./ai-config.ts";

export type GroqCallOptions = {
  apiKey: string;
  systemPrompt: string;
  userText: string;
  tool: ToolDefinition;
  maxOutputTokens: number;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
};

export type GroqHttpOutcome = {
  status: number;
  headers: Record<string, string>;
  bodyText: string;
  timedOut: boolean;
  networkError: boolean;
};

export type ParsedToolCall =
  | {
      ok: true;
      args: Record<string, unknown>;
      usage: ProviderUsage;
      finishReason: string | null;
    }
  | { ok: false; kind: "schema" | "policy"; message: string };

export function groqUrl(): string {
  return `${AI_CONFIG.secondary.baseUrl}/chat/completions`;
}

export function buildGroqRequest(opts: {
  systemPrompt: string;
  userText: string;
  tool: ToolDefinition;
  maxOutputTokens: number;
}): Record<string, unknown> {
  return {
    model: AI_CONFIG.secondary.model,
    messages: [
      { role: "system", content: opts.systemPrompt },
      { role: "user", content: opts.userText },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: opts.tool.name,
          description: opts.tool.description,
          parameters: opts.tool.parameters,
        },
      },
    ],
    tool_choice: { type: "function", function: { name: opts.tool.name } },
    max_tokens: opts.maxOutputTokens,
  };
}

function pickHeaders(
  headers: { get?: (name: string) => string | null } | undefined | null,
  names: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  const get = headers?.get?.bind(headers);
  if (!get) return out;
  for (const name of names) {
    const v = get(name);
    if (typeof v === "string" && v !== "") out[name] = v;
  }
  return out;
}

export async function callGroq(opts: GroqCallOptions): Promise<GroqHttpOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const doFetch = opts.fetchImpl ?? fetch;
    const resp = await doFetch(groqUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildGroqRequest(opts)),
      signal: controller.signal,
    });
    const headers = pickHeaders(resp.headers, [
      "x-ratelimit-remaining-requests",
      "x-ratelimit-remaining-tokens",
      "x-ratelimit-reset-requests",
      "x-ratelimit-reset-tokens",
      "retry-after",
    ]);
    const bodyText = await resp.text();
    return {
      status: resp.status,
      headers,
      bodyText,
      timedOut: false,
      networkError: false,
    };
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    if (name === "AbortError" || name === "TimeoutError") {
      return { status: 0, headers: {}, bodyText: "", timedOut: true, networkError: false };
    }
    return { status: 0, headers: {}, bodyText: "", timedOut: false, networkError: true };
  } finally {
    clearTimeout(timer);
  }
}

function groqUsage(root: Record<string, unknown>): ProviderUsage {
  const m = root.usage as Record<string, unknown> | undefined;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    inputTokens: num(m?.prompt_tokens),
    outputTokens: num(m?.completion_tokens),
    totalTokens: num(m?.total_tokens),
  };
}

/** Parse a Groq chat-completions response into a tool call (or an error). */
export function parseGroqResponse(json: unknown): ParsedToolCall {
  const root = (json ?? {}) as Record<string, unknown>;
  const choices = root.choices as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(choices) || choices.length === 0) {
    return { ok: false, kind: "schema", message: "Groq returned no choices" };
  }
  const first = choices[0];
  const finishReason =
    typeof first.finish_reason === "string" ? first.finish_reason : null;
  const message = first.message as Record<string, unknown> | undefined;
  const toolCalls = message?.tool_calls as
    | Array<Record<string, unknown>>
    | undefined;
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    if (finishReason === "length") {
      return {
        ok: false,
        kind: "schema",
        message: "Groq stopped at the output-token ceiling (finish_reason length)",
      };
    }
    return { ok: false, kind: "schema", message: "no tool call returned" };
  }
  const fn = toolCalls[0].function as Record<string, unknown> | undefined;
  const rawArgs = fn?.arguments;
  if (typeof rawArgs !== "string") {
    return {
      ok: false,
      kind: "schema",
      message: "Groq tool call has no arguments string",
    };
  }
  let args: unknown;
  try {
    args = JSON.parse(rawArgs);
  } catch {
    return {
      ok: false,
      kind: "schema",
      message: "Groq tool call arguments are not valid JSON",
    };
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return {
      ok: false,
      kind: "schema",
      message: "Groq tool call arguments are not an object",
    };
  }
  return {
    ok: true,
    args: args as Record<string, unknown>,
    usage: groqUsage(root),
    finishReason,
  };
}
