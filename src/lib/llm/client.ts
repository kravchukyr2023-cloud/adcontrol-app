import "server-only";
import { requireEnv } from "@/server/env";

/**
 * Tiny OpenAI Chat Completions wrapper using fetch (no SDK) — keeps the
 * dependency surface small and the failure modes legible for the Decision
 * Engine, which must degrade gracefully when the LLM is unavailable.
 *
 * Every non-2xx HTTP status maps to one of the typed errors below so callers
 * can decide whether to retry (network / 5xx), drop the request (auth, quota,
 * rate limit), or fall back to a template (anything else).
 *
 * Timeout is enforced via AbortController; 25s leaves headroom under the
 * platform endpoint's 30s maxDuration so Vercel doesn't reap us first.
 */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";
const REQUEST_TIMEOUT_MS = 25_000;

export class LlmError extends Error {
  readonly status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "LlmError";
    this.status = status;
  }
}

/** 401 / 403 — bad key, missing permissions. NOT retried. */
export class LlmAuthError extends LlmError {
  constructor(message: string) {
    super(message, 401);
    this.name = "LlmAuthError";
  }
}

/** 429 — rate limit or `insufficient_quota`. NOT retried. */
export class LlmRateLimitError extends LlmError {
  constructor(message: string) {
    super(message, 429);
    this.name = "LlmRateLimitError";
  }
}

/** Network / timeout / 5xx — retryable once before bubbling up. */
export class LlmUnavailableError extends LlmError {
  constructor(message: string, status = 503) {
    super(message, status);
    this.name = "LlmUnavailableError";
  }
}

export type LlmRequest = {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  /** Override for tests / explicit model pinning. */
  model?: string;
};

/**
 * Single-shot Chat Completions call. Returns the assistant text content.
 * One retry on retryable failures (network / 5xx) — auth + rate-limit
 * statuses skip the retry because they won't change on a second attempt.
 */
export async function callLlm(req: LlmRequest): Promise<string> {
  const apiKey = requireEnv("OPENAI_API_KEY");
  const model = req.model ?? DEFAULT_MODEL;
  const temperature = req.temperature ?? 0.4;
  const maxTokens = req.maxTokens ?? 800;

  const body = JSON.stringify({
    model,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: req.user },
    ],
  });

  let attempt = 0;
  // First try; on retryable failure, one more.
  while (true) {
    attempt += 1;
    try {
      return await postOnce(apiKey, body);
    } catch (err) {
      if (
        attempt < 2 &&
        (err instanceof LlmUnavailableError ||
          (err instanceof LlmError && err.status >= 500))
      ) {
        await sleep(500);
        continue;
      }
      throw err;
    }
  }
}

async function postOnce(apiKey: string, body: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let resp: Response;
  try {
    resp = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const isAbort =
      err instanceof Error && err.name === "AbortError";
    const msg = isAbort
      ? `LLM request timed out after ${REQUEST_TIMEOUT_MS}ms`
      : err instanceof Error
        ? err.message
        : "Network error";
    throw new LlmUnavailableError(msg);
  }
  clearTimeout(timer);

  const text = await resp.text();
  if (!resp.ok) {
    const detail = extractError(text) ?? resp.statusText;
    if (resp.status === 401 || resp.status === 403) {
      throw new LlmAuthError(detail || "LLM auth failed");
    }
    if (resp.status === 429) {
      // The quota-exhausted message is also a 429 but distinct from a
      // throttle. Surface verbatim so the caller can log/tell apart.
      throw new LlmRateLimitError(detail || "LLM rate-limited");
    }
    if (resp.status >= 500) {
      throw new LlmUnavailableError(
        detail || `LLM upstream error (${resp.status})`,
        resp.status
      );
    }
    throw new LlmError(
      detail || `LLM request failed (${resp.status})`,
      resp.status
    );
  }

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new LlmError("LLM returned non-JSON response");
  }

  type ChatChoice = { message?: { content?: string } };
  type ChatResponse = { choices?: ChatChoice[] };
  const content =
    (parsed as ChatResponse)?.choices?.[0]?.message?.content ?? null;
  if (typeof content !== "string" || content.length === 0) {
    throw new LlmError("LLM returned empty content");
  }
  return content;
}

function extractError(text: string): string | null {
  if (!text) return null;
  try {
    const body = JSON.parse(text) as {
      error?: { message?: string; code?: string };
    };
    const msg = body.error?.message;
    const code = body.error?.code;
    if (msg && code) return `${code}: ${msg}`;
    if (msg) return msg;
  } catch {
    return null;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
