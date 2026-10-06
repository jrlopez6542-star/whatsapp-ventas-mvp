import { randomUUID } from "crypto";
import { ensureTursoReady, getTursoClient, isTursoConfigured } from "@/lib/store/db";
import {
  sendOutboundWhatsApp,
  type OutboundWhatsAppResult,
} from "@/lib/whatsapp-send";

const DEFAULT_MIN_DELAY_MS = 2_500;
const DEFAULT_MAX_DELAY_MS = 5_500;
const MAX_CONFIGURED_DELAY_MS = 30_000;
const LOCK_WAIT_MS = 45_000;
const LOCK_POLL_MS = 150;

export type ReplyDelayConfig = {
  minMs: number;
  maxMs: number;
};

function envMilliseconds(
  value: string | undefined,
  fallback: number
): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_CONFIGURED_DELAY_MS, Math.max(0, Math.round(parsed)));
}

/** Optional env overrides; invalid values safely fall back and reversed bounds are sorted. */
export function getReplyDelayConfig(
  env: Record<string, string | undefined> = process.env
): ReplyDelayConfig {
  const a = envMilliseconds(
    env.WHATSAPP_REPLY_DELAY_MIN_MS,
    DEFAULT_MIN_DELAY_MS
  );
  const b = envMilliseconds(
    env.WHATSAPP_REPLY_DELAY_MAX_MS,
    DEFAULT_MAX_DELAY_MS
  );
  return { minMs: Math.min(a, b), maxMs: Math.max(a, b) };
}

export function randomReplyDelayMs(
  config: ReplyDelayConfig = getReplyDelayConfig(),
  random: () => number = Math.random
): number {
  if (config.maxMs <= config.minMs) return config.minMs;
  const sample = Math.min(0.999999999999, Math.max(0, random()));
  return config.minMs + Math.floor(sample * (config.maxMs - config.minMs + 1));
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

declare global {
  // Per warm instance; Turso lock below adds cross-instance exclusion in production.
  var __whatsappConversationQueueTails: Map<string, Promise<void>> | undefined;
}

function localTails(): Map<string, Promise<void>> {
  if (!globalThis.__whatsappConversationQueueTails) {
    globalThis.__whatsappConversationQueueTails = new Map();
  }
  return globalThis.__whatsappConversationQueueTails;
}

/** FIFO serialization in one process. Exported to make concurrency behavior testable. */
export async function runSerializedConversation<T>(
  conversationKey: string,
  task: () => Promise<T>
): Promise<T> {
  const key = conversationKey || "unknown";
  const tails = localTails();
  const previous = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => undefined).then(() => gate);
  tails.set(key, tail);

  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (tails.get(key) === tail) tails.delete(key);
  }
}

async function acquireDistributedLock(
  conversationKey: string,
  owner: string,
  leaseMs: number
): Promise<boolean> {
  const client = getTursoClient();
  const deadline = Date.now() + LOCK_WAIT_MS;

  while (Date.now() < deadline) {
    const now = Date.now();
    const result = await client.execute({
      sql: `INSERT INTO outbound_conversation_locks
              (conversation_key, owner, locked_until)
            VALUES (?, ?, ?)
            ON CONFLICT(conversation_key) DO UPDATE SET
              owner = excluded.owner,
              locked_until = excluded.locked_until
            WHERE outbound_conversation_locks.locked_until <= ?
               OR outbound_conversation_locks.owner = ?
            RETURNING owner`,
      args: [conversationKey, owner, now + leaseMs, now, owner],
    });
    if (result.rows.some((row) => String(row.owner) === owner)) return true;
    await sleep(LOCK_POLL_MS);
  }
  return false;
}

async function releaseDistributedLock(
  conversationKey: string,
  owner: string
): Promise<void> {
  await getTursoClient().execute({
    sql: `DELETE FROM outbound_conversation_locks
          WHERE conversation_key = ? AND owner = ?`,
    args: [conversationKey, owner],
  });
}

async function withDistributedConversationLock<T>(
  conversationKey: string,
  maxDelayMs: number,
  task: () => Promise<T>
): Promise<T> {
  if (!isTursoConfigured()) return task();

  const owner = randomUUID();
  // Delay + generous network allowance, but a crashed worker cannot block forever.
  const leaseMs = Math.max(30_000, maxDelayMs + 25_000);

  try {
    await ensureTursoReady();
  } catch (error) {
    console.error("[outbound queue] Turso not ready; using local queue", {
      conversationKey,
      error: error instanceof Error ? error.message : String(error),
    });
    return task();
  }

  let acquired = false;
  try {
    acquired = await acquireDistributedLock(conversationKey, owner, leaseMs);
  } catch (error) {
    console.error("[outbound queue] distributed lock unavailable; using local queue", {
      conversationKey,
      error: error instanceof Error ? error.message : String(error),
    });
    return task();
  }

  if (!acquired) {
    console.error("[outbound queue] lock wait timed out; using local queue", {
      conversationKey,
    });
    return task();
  }

  try {
    return await task();
  } finally {
    await releaseDistributedLock(conversationKey, owner).catch((error) => {
      console.error("[outbound queue] lock release failed", {
        conversationKey,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}

export type DelayedOutboundResult = OutboundWhatsAppResult & {
  delayMs: number;
};

/**
 * Human-like delayed send, serialized per conversation. Turso provides a short
 * distributed lock across Vercel instances; the in-memory FIFO is the fallback.
 */
export async function sendDelayedOutboundWhatsApp(
  conversationKey: string,
  to: string,
  body: string
): Promise<DelayedOutboundResult> {
  return runSerializedConversation(conversationKey, async () => {
    const config = getReplyDelayConfig();
    return withDistributedConversationLock(
      conversationKey,
      config.maxMs,
      async () => {
        const delayMs = randomReplyDelayMs(config);
        console.log("[outbound queue] scheduled", {
          conversationKey,
          delayMs,
        });
        await sleep(delayMs);
        const result = await sendOutboundWhatsApp(to, body);
        return { ...result, delayMs };
      }
    );
  });
}