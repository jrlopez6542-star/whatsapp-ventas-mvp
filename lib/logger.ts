import { randomUUID } from "crypto";
import { ensureTursoReady, getTursoClient, isTursoConfigured } from "./store/db";

export type LogLevel = "info" | "success" | "warn" | "error";
export type LogModule =
  | "voice"
  | "whatsapp"
  | "agent"
  | "payment"
  | "billing"
  | "driver"
  | "system";

export interface SystemLog {
  id: string;
  level: LogLevel;
  module: LogModule;
  message: string;
  details?: string;
  createdAt: number;
}

// Buffer circular en memoria para lectura inmediata
const MEMORY_LOGS_LIMIT = 200;
const memoryLogs: SystemLog[] = [];

/**
 * Registra un evento de auditoría en memoria y en la base de datos (Turso)
 * de forma asíncrona y no bloqueante.
 */
export function logSystemEvent(
  level: LogLevel,
  module: LogModule,
  message: string,
  details?: Record<string, unknown> | string | null
): void {
  const id = randomUUID();
  const createdAt = Date.now();
  const detailsStr =
    details == null
      ? undefined
      : typeof details === "string"
      ? details
      : JSON.stringify(details);

  const entry: SystemLog = {
    id,
    level,
    module,
    message,
    details: detailsStr,
    createdAt,
  };

  // 1. Guardar en memoria
  memoryLogs.unshift(entry);
  if (memoryLogs.length > MEMORY_LOGS_LIMIT) {
    memoryLogs.length = MEMORY_LOGS_LIMIT;
  }

  // 2. Log en consola para Vercel
  const prefix = `[system-log][${module.toUpperCase()}][${level.toUpperCase()}]`;
  if (level === "error") {
    console.error(prefix, message, details || "");
  } else if (level === "warn") {
    console.warn(prefix, message, details || "");
  } else {
    console.log(prefix, message, details || "");
  }

  // 3. Persistir en Turso de fondo sin frenar la ejecución
  if (isTursoConfigured()) {
    ensureTursoReady()
      .then(() => {
        const client = getTursoClient();
        return client.execute({
          sql: `INSERT INTO system_logs (id, level, module, message, details, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
          args: [id, level, module, message, detailsStr || null, createdAt],
        });
      })
      .catch((err) => {
        console.warn("[logger] No se pudo guardar log en Turso:", err?.message || err);
      });
  }
}

/**
 * Obtiene los registros de auditoría más recientes
 */
export async function getSystemLogs(limit = 100): Promise<SystemLog[]> {
  if (isTursoConfigured()) {
    try {
      await ensureTursoReady();
      const client = getTursoClient();
      const res = await client.execute({
        sql: `SELECT id, level, module, message, details, created_at FROM system_logs ORDER BY created_at DESC LIMIT ?`,
        args: [limit],
      });

      if (res.rows && res.rows.length > 0) {
        return res.rows.map((r: any) => ({
          id: String(r.id),
          level: (r.level as LogLevel) || "info",
          module: (r.module as LogModule) || "system",
          message: String(r.message || ""),
          details: r.details ? String(r.details) : undefined,
          createdAt: Number(r.created_at) || Date.now(),
        }));
      }
    } catch (err) {
      console.warn("[logger] Error consultando logs en Turso, usando memoria:", err);
    }
  }

  return memoryLogs.slice(0, limit);
}

/**
 * Limpia el historial de registros
 */
export async function clearSystemLogs(): Promise<void> {
  memoryLogs.length = 0;
  if (isTursoConfigured()) {
    try {
      await ensureTursoReady();
      const client = getTursoClient();
      await client.execute("DELETE FROM system_logs");
    } catch (err) {
      console.warn("[logger] Error limpiando logs en Turso:", err);
    }
  }
}
