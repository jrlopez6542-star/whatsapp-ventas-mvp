/** Returns only a safe category/status, never provider error text that could contain credentials. */
export function safeProviderErrorLabel(error: unknown): string {
  if (!error || typeof error !== "object") return "ProviderError";

  const candidate = error as { name?: unknown; status?: unknown; statusCode?: unknown };
  const status = candidate.status ?? candidate.statusCode;
  if (typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599) {
    return `HTTP_${status}`;
  }

  const name = candidate.name;
  if (name === "TimeoutError" || name === "AbortError" || name === "TypeError" || name === "SyntaxError") {
    return name;
  }
  return "ProviderError";
}
