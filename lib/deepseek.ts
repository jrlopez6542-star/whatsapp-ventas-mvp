export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

export const DEEPSEEK_MODELS = {
  sales: "deepseek-flash",
  receipt: "deepseek-flash",
  diagnostics: "deepseek-flash",
} as const;

export type DeepSeekMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" | "original" } }>;
};

export type DeepSeekCompletionOptions = {
  model: (typeof DEEPSEEK_MODELS)[keyof typeof DEEPSEEK_MODELS];
  messages: DeepSeekMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonOutput?: boolean;
  timeoutMs?: number;
};

export type DeepSeekCompletion = {
  choices: Array<{ message: { content: string } }>;
  model?: string;
};

export class DeepSeekRequestError extends Error {
  constructor(
    message: string,
    readonly kind: "configuration" | "timeout" | "http" | "invalid_response" | "empty_response",
    readonly status?: number
  ) {
    super(message);
    this.name = "DeepSeekRequestError";
  }
}

export async function createDeepSeekChatCompletion(
  options: DeepSeekCompletionOptions,
  dependencies: { apiKey?: string; fetchImpl?: typeof fetch } = {}
): Promise<DeepSeekCompletion> {
  const apiKey = dependencies.apiKey ?? process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) {
    throw new DeepSeekRequestError("DeepSeek API key is not configured", "configuration");
  }

  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const payload: Record<string, unknown> = {
    model: options.model,
    messages: options.messages,
    thinking: { type: "disabled" },
  };
  if (options.temperature !== undefined) payload.temperature = options.temperature;
  if (options.maxTokens !== undefined) payload.max_tokens = options.maxTokens;
  if (options.jsonOutput) payload.response_format = { type: "json_object" };

  let response: Response;
  try {
    response = await fetchImpl(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new DeepSeekRequestError("DeepSeek request timed out", "timeout");
    }
    throw error;
  }

  if (!response.ok) {
    throw new DeepSeekRequestError("DeepSeek returned an HTTP error", "http", response.status);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new DeepSeekRequestError("DeepSeek returned an invalid response", "invalid_response");
  }

  if (!body || typeof body !== "object" || !Array.isArray((body as { choices?: unknown }).choices)) {
    throw new DeepSeekRequestError("DeepSeek returned an invalid response", "invalid_response");
  }

  const completion = body as { choices: Array<{ message?: { content?: unknown } }>; model?: unknown };
  const content = completion.choices[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new DeepSeekRequestError("DeepSeek returned an empty response", "empty_response");
  }

  return {
    choices: [{ message: { content } }],
    model: typeof completion.model === "string" ? completion.model : undefined,
  };
}

export async function runDeepSeekDiagnostic(missingKeyMessage = "Not configured"): Promise<string> {
  if (!process.env.DEEPSEEK_API_KEY?.trim()) return missingKeyMessage;

  try {
    const result = await createDeepSeekChatCompletion({
      model: DEEPSEEK_MODELS.diagnostics,
      messages: [{ role: "user", content: "Responde únicamente con la palabra 'OK'" }],
      temperature: 0,
      maxTokens: 10,
    });
    return `OK: ${result.choices[0].message.content.trim()}`;
  } catch (error) {
    if (error instanceof DeepSeekRequestError) {
      return error.status ? `Error: HTTP ${error.status}` : `Error: ${error.kind}`;
    }
    return "Error: request failed";
  }
}
