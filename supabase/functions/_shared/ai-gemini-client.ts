// supabase/functions/_shared/ai-gemini-client.ts
// Phase 3 (2026-11-13): Gemini native REST client for the Adapter.
//
// Endpoint: POST {baseUrl}/models/{model}:generateContent (verified in
// AI-PROVIDER-VERIFICATION.md §2). The API key is sent as the
// `x-goog-api-key` header (never in the URL, so it never lands in logs).
//
// Forced tool call: the classic mechanism
// `toolConfig.functionCallingConfig.mode: "ANY"` (with
// `allowedFunctionNames`) is used. The verification doc records this
// mechanism as BLOCKED — it was not re-verified on the current docs,
// which lead with the Interactions API. The request shape below is
// modelled in a mocked fixture (ai-adapter.test.mjs) and the real
// mechanism is confirmed in Rehearsal (Phase 5), not assumed.
//
// This client never throws for an HTTP error: it returns the raw outcome
// (status + headers + body) and the Adapter classifies it. It only
// returns a synthetic status-0 outcome for a timeout or a network
// failure. Response parsing is a pure function, unit-tested with
// fixtures built from the official API reference shapes.

import { AI_CONFIG } from "./ai-config.ts";
import type { ProviderUsage, ToolDefinition } from "./ai-config.ts";

export type GeminiCallOptions = {
  apiKey: string;
  systemPrompt: string;
  userText: string;
  tool: ToolDefinition;
  maxOutputTokens: number;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
};

export type GeminiHttpOutcome = {
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

export function geminiUrl(): string {
  return `${AI_CONFIG.primary.baseUrl}/models/${AI_CONFIG.primary.model}:generateContent`;
}

export function buildGeminiRequest(opts: {
  systemPrompt: string;
  userText: string;
  tool: ToolDefinition;
  maxOutputTokens: number;
}): Record<string, unknown> {
  return {
    systemInstruction: { parts: [{ text: opts.systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: opts.userText }] }],
    tools: [
      {
        functionDeclarations: [
          {
            name: opts.tool.name,
            description: opts.tool.description,
            parameters: opts.tool.parameters,
          },
        ],
      },
    ],
    toolConfig: {
      functionCallingConfig: {
        mode: "ANY",
        allowedFunctionNames: [opts.tool.name],
      },
    },
    generationConfig: { maxOutputTokens: opts.maxOutputTokens },
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

export async function callGemini(
  opts: GeminiCallOptions,
): Promise<GeminiHttpOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const doFetch = opts.fetchImpl ?? fetch;
    const resp = await doFetch(geminiUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": opts.apiKey,
      },
      body: JSON.stringify(buildGeminiRequest(opts)),
      signal: controller.signal,
    });
    const headers = pickHeaders(resp.headers, ["retry-after"]);
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

function geminiUsage(root: Record<string, unknown>): ProviderUsage {
  const m = root.usageMetadata as Record<string, unknown> | undefined;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  return {
    inputTokens: num(m?.promptTokenCount),
    outputTokens: num(m?.candidatesTokenCount),
    totalTokens: num(m?.totalTokenCount),
  };
}

/** Parse a generateContent response envelope into a tool call (or an error). */
export function parseGeminiResponse(json: unknown): ParsedToolCall {
  const root = (json ?? {}) as Record<string, unknown>;
  const promptFeedback = root.promptFeedback as
    | Record<string, unknown>
    | undefined;
  const blockReason =
    typeof promptFeedback?.blockReason === "string"
      ? promptFeedback.blockReason
      : null;
  if (blockReason) {
    return {
      ok: false,
      kind: "policy",
      message: `Gemini blocked the prompt (${blockReason})`,
    };
  }
  const candidates = root.candidates as
    | Array<Record<string, unknown>>
    | undefined;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { ok: false, kind: "policy", message: "Gemini returned no candidates" };
  }
  const first = candidates[0];
  const finishReason =
    typeof first.finishReason === "string" ? first.finishReason : null;
  if (
    finishReason === "MALFORMED_FUNCTION_CALL" ||
    finishReason === "UNEXPECTED_TOOL_CALL" ||
    finishReason === "TOO_MANY_TOOL_CALLS"
  ) {
    return { ok: false, kind: "schema", message: `Gemini finishReason ${finishReason}` };
  }
  if (
    finishReason === "SAFETY" ||
    finishReason === "BLOCKLIST" ||
    finishReason === "PROHIBITED_CONTENT"
  ) {
    return { ok: false, kind: "policy", message: `Gemini finishReason ${finishReason}` };
  }
  if (finishReason === "MAX_TOKENS") {
    return {
      ok: false,
      kind: "schema",
      message: "Gemini stopped at the output-token ceiling (MAX_TOKENS)",
    };
  }
  const content = first.content as Record<string, unknown> | undefined;
  const parts = content?.parts as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(parts)) {
    for (const part of parts) {
      const fn = part.functionCall as Record<string, unknown> | undefined;
      if (fn && typeof fn.name === "string") {
        const rawArgs = fn.args;
        let args: unknown = rawArgs;
        if (typeof rawArgs === "string") {
          try {
            args = JSON.parse(rawArgs);
          } catch {
            return {
              ok: false,
              kind: "schema",
              message: "Gemini functionCall.args is not valid JSON",
            };
          }
        }
        if (!args || typeof args !== "object" || Array.isArray(args)) {
          return {
            ok: false,
            kind: "schema",
            message: "Gemini functionCall.args is not an object",
          };
        }
        return {
          ok: true,
          args: args as Record<string, unknown>,
          usage: geminiUsage(root),
          finishReason,
        };
      }
    }
  }
  return { ok: false, kind: "schema", message: "no tool call returned" };
}
