import { ensureTursoReady, getTursoClient, isTursoConfigured } from "@/lib/store/db";

const DEDUPE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEDUPE_MAX = 4_000;

declare global {
  var __whatsappSeenWebhookIds: Map<string, number> | undefined;
}

function memoryClaim(id: string): boolean {
  if (!globalThis.__whatsappSeenWebhookIds) {
    globalThis.__whatsappSeenWebhookIds = new Map();
  }
  const seen = globalThis.__whatsappSeenWebhookIds;
  const now = Date.now();
  const previous = seen.get(id);
  if (previous && now - previous < DEDUPE_TTL_MS) return false;
  seen.set(id, now);
  if (seen.size > DEDUPE_MAX) {
    for (const [key, at] of seen) {
      if (now - at >= DEDUPE_TTL_MS) seen.delete(key);
    }
  }
  return true;
}

/** Atomically claims a provider event; false means another invocation handled it. */
export async function claimWebhookEvent(id: string): Promise<boolean> {
  if (!id) return true;
  if (!isTursoConfigured()) return memoryClaim(id);

  try {
    await ensureTursoReady();
    const now = Date.now();
    const result = await getTursoClient().execute({
      sql: `INSERT OR IGNORE INTO webhook_receipts (id, received_at)
            VALUES (?, ?)`,
      args: [id, now],
    });
    if (Math.random() < 0.01) {
      void getTursoClient()
        .execute({
          sql: "DELETE FROM webhook_receipts WHERE received_at < ?",
          args: [now - DEDUPE_TTL_MS],
        })
        .catch(() => undefined);
    }
    return Number(result.rowsAffected ?? 0) === 1;
  } catch (error) {
    console.error("[webhook dedupe] Turso unavailable; using memory", {
      error: error instanceof Error ? error.message : String(error),
    });
    return memoryClaim(id);
  }
}