import { ensureTursoReady, getTursoClient, isTursoConfigured } from "@/lib/store/db";

const DEDUPE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días de retención
const DEDUPE_MAX = 4_000;
export const PROCESSING_LOCK_TIMEOUT_MS = 60_000; // 60 segundos (ventana máxima de after() en Vercel)

export type WebhookEventStatus = "processing" | "completed" | "failed";

export interface WebhookReceiptRecord {
  id: string;
  receivedAt: number;
  status: WebhookEventStatus;
  completedAt?: number;
  error?: string;
  orderId?: string;
}

export interface WebhookClaimResult {
  claimed: boolean;
  status?: WebhookEventStatus;
  reason?: "already_completed" | "still_processing" | "stale_takeover" | "retry_after_failure" | "contested" | "new";
  orderId?: string;
}

declare global {
  var __whatsappWebhookReceipts: Map<string, WebhookReceiptRecord> | undefined;
}

function getMemoryReceipts(): Map<string, WebhookReceiptRecord> {
  if (!globalThis.__whatsappWebhookReceipts) {
    globalThis.__whatsappWebhookReceipts = new Map();
  }
  return globalThis.__whatsappWebhookReceipts;
}

function memoryClaimDetailed(id: string): WebhookClaimResult {
  const seen = getMemoryReceipts();
  const now = Date.now();
  const existing = seen.get(id);

  if (!existing) {
    seen.set(id, {
      id,
      receivedAt: now,
      status: "processing",
    });
    // Limpieza de caché antigua en memoria
    if (seen.size > DEDUPE_MAX) {
      for (const [key, record] of seen) {
        if (now - record.receivedAt >= DEDUPE_TTL_MS) seen.delete(key);
      }
    }
    return { claimed: true, status: "processing", reason: "new" };
  }

  // 1. Si ya fue completado exitosamente, NUNCA reprocesar (evita duplicar pedidos)
  if (existing.status === "completed") {
    return { claimed: false, status: "completed", reason: "already_completed", orderId: existing.orderId };
  }

  // 2. Si está en procesamiento activo, NO liberar automáticamente mientras la tarea siga corriendo
  if (existing.status === "processing") {
    const isStillActive = now - existing.receivedAt < PROCESSING_LOCK_TIMEOUT_MS;
    if (isStillActive) {
      return { claimed: false, status: "processing", reason: "still_processing" };
    }
    // Si superó los 60 segundos, se considera caída o muerte del proceso anterior (stale) y se recupera
    existing.receivedAt = now;
    existing.status = "processing";
    return { claimed: true, status: "processing", reason: "stale_takeover", orderId: existing.orderId };
  }

  // 3. Si falló explícitamente en el intento anterior, permitir reintento controlado
  if (existing.status === "failed") {
    existing.receivedAt = now;
    existing.status = "processing";
    return { claimed: true, status: "processing", reason: "retry_after_failure", orderId: existing.orderId };
  }

  return { claimed: false, reason: "contested" };
}

/**
 * Reclama de forma atómica y recuperable un evento entrante del proveedor.
 * - Bloquea ejecuciones concurrentes mientras el evento esté activo.
 * - Impide doble procesamiento si el evento ya fue completado exitosamente.
 * - Permite recuperación si el proceso anterior falló explícitamente o superó el timeout de 60s.
 */
export async function claimWebhookEventDetailed(id: string): Promise<WebhookClaimResult> {
  if (!id) return { claimed: true, reason: "new" };
  if (!isTursoConfigured()) return memoryClaimDetailed(id);

  try {
    await ensureTursoReady();
    const client = getTursoClient();
    const now = Date.now();
    const staleThreshold = now - PROCESSING_LOCK_TIMEOUT_MS;

    // Intento 1: Inserción inicial atómica como 'processing'
    const insertRes = await client.execute({
      sql: `INSERT OR IGNORE INTO webhook_receipts (id, received_at, status)
            VALUES (?, ?, 'processing')`,
      args: [id, now],
    });

    if (Number(insertRes.rowsAffected ?? 0) === 1) {
      // Limpieza probabilística de eventos muy viejos
      if (Math.random() < 0.01) {
        void client
          .execute({
            sql: "DELETE FROM webhook_receipts WHERE received_at < ?",
            args: [now - DEDUPE_TTL_MS],
          })
          .catch(() => undefined);
      }
      return { claimed: true, status: "processing", reason: "new" };
    }

    // Intento 2: El evento ya existe en base de datos. Consultar su estado actual
    const checkRes = await client.execute({
      sql: `SELECT id, received_at, status, order_id FROM webhook_receipts WHERE id = ? LIMIT 1`,
      args: [id],
    });

    if (checkRes.rows.length === 0) {
      return { claimed: false, reason: "contested" };
    }

    const row: any = checkRes.rows[0];
    const currentStatus = (row.status as WebhookEventStatus) || "completed";
    const lastReceived = Number(row.received_at || 0);
    const existingOrderId = row.order_id ? String(row.order_id) : undefined;

    // A. Si ya fue completado: NUNCA duplicar
    if (currentStatus === "completed") {
      return { claimed: false, status: "completed", reason: "already_completed", orderId: existingOrderId };
    }

    // B. Si está en 'processing', verificar si sigue activo dentro de la ventana de 60s
    if (currentStatus === "processing") {
      const isStillActive = now - lastReceived < PROCESSING_LOCK_TIMEOUT_MS;
      if (isStillActive) {
        // No liberar mientras el procesamiento siga activo
        return { claimed: false, status: "processing", reason: "still_processing" };
      }

      // Reclamar proceso huérfano / timeout de forma atómica condicional
      const updateRes = await client.execute({
        sql: `UPDATE webhook_receipts
              SET status = 'processing', received_at = ?
              WHERE id = ? AND status = 'processing' AND received_at <= ?`,
        args: [now, id, staleThreshold],
      });

      if (Number(updateRes.rowsAffected ?? 0) === 1) {
        return { claimed: true, status: "processing", reason: "stale_takeover", orderId: existingOrderId };
      }
      return { claimed: false, reason: "contested" };
    }

    // C. Si falló explícitamente, permitir reintento controlado
    if (currentStatus === "failed") {
      const retryRes = await client.execute({
        sql: `UPDATE webhook_receipts
              SET status = 'processing', received_at = ?
              WHERE id = ? AND status = 'failed'`,
        args: [now, id],
      });

      if (Number(retryRes.rowsAffected ?? 0) === 1) {
        return { claimed: true, status: "processing", reason: "retry_after_failure", orderId: existingOrderId };
      }
      return { claimed: false, reason: "contested" };
    }

    return { claimed: false, reason: "contested" };
  } catch (error) {
    console.error("[webhook dedupe] Turso unavailable; using memory fallback", {
      error: error instanceof Error ? error.message : String(error),
    });
    return memoryClaimDetailed(id);
  }
}

/**
 * Función estándar de compatibilidad booleana para endpoints existentes.
 */
export async function claimWebhookEvent(id: string): Promise<boolean> {
  const result = await claimWebhookEventDetailed(id);
  return result.claimed;
}

/**
 * Marca un evento de webhook como completado exitosamente, registrando opcionalmente el pedido creado.
 */
export async function completeWebhookEvent(id: string, options?: { orderId?: string }): Promise<void> {
  if (!id) return;
  const now = Date.now();
  const mem = getMemoryReceipts().get(id);
  if (mem) {
    mem.status = "completed";
    mem.completedAt = now;
    if (options?.orderId) mem.orderId = options.orderId;
  }

  if (isTursoConfigured()) {
    try {
      await ensureTursoReady();
      const client = getTursoClient();
      await client.execute({
        sql: `UPDATE webhook_receipts
              SET status = 'completed', completed_at = ?, order_id = COALESCE(?, order_id)
              WHERE id = ?`,
        args: [now, options?.orderId || null, id],
      });
    } catch (err) {
      console.warn("[webhook dedupe] Error marcando evento como completado en Turso:", err);
    }
  }
}

/**
 * Marca un evento de webhook como fallido para permitir reintentos posteriores.
 */
export async function failWebhookEvent(id: string, error?: string): Promise<void> {
  if (!id) return;
  const mem = getMemoryReceipts().get(id);
  if (mem) {
    mem.status = "failed";
    mem.error = error;
  }

  if (isTursoConfigured()) {
    try {
      await ensureTursoReady();
      const client = getTursoClient();
      await client.execute({
        sql: `UPDATE webhook_receipts
              SET status = 'failed', error = ?
              WHERE id = ?`,
        args: [error || "Unknown processing error", id],
      });
    } catch (err) {
      console.warn("[webhook dedupe] Error marcando evento como fallido en Turso:", err);
    }
  }
}

/**
 * Limpia la memoria de eventos de webhook para pruebas unitarias.
 */
export function resetWebhookDedupeForTesting(): void {
  if (globalThis.__whatsappWebhookReceipts) {
    globalThis.__whatsappWebhookReceipts.clear();
  }
}