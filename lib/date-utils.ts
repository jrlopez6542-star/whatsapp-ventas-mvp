/**
 * Utilidades para formatear fechas y horas en la zona horaria de Colombia (America/Bogota)
 */

export function parseDateSafe(ts: number | string | undefined | null): Date {
  if (ts == null) return new Date();
  if (typeof ts === "number") {
    if (isNaN(ts) || ts <= 86400000) return new Date();
    if (ts < 10000000000) return new Date(ts * 1000); // unix timestamp en segundos
    return new Date(ts);
  }
  const str = String(ts).trim();
  if (!str || str === "0") return new Date();
  const num = Number(str);
  if (!isNaN(num)) {
    if (num <= 86400000) return new Date();
    if (num < 10000000000) return new Date(num * 1000);
    return new Date(num);
  }
  const parsed = Date.parse(str);
  if (!isNaN(parsed) && parsed > 86400000) return new Date(parsed);
  return new Date();
}

/**
 * Formatea la hora de un mensaje para la burbuja de chat:
 * Ej: "9:42 a. m." o "3:15 p. m." en hora colombiana (12h)
 */
export function formatMessageTime(ts: number | string | undefined | null): string {
  const d = parseDateSafe(ts);
  return d.toLocaleTimeString("es-CO", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Bogota",
  });
}

/**
 * Formatea el tiempo para la lista lateral de conversaciones (estilo WhatsApp):
 * - Si es hoy: muestra la hora ("9:42 a. m.")
 * - Si fue ayer: muestra "Ayer"
 * - Si fue en los últimos 6 días: muestra el día ("Lunes", "Martes", etc.)
 * - Si es anterior: muestra la fecha ("12/10/26")
 */
export function formatConversationListTime(ts: number | string | undefined | null): string {
  const d = parseDateSafe(ts);
  const now = new Date();

  const dBogotaStr = d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" }); // "YYYY-MM-DD"
  const nowBogotaStr = now.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

  if (dBogotaStr === nowBogotaStr) {
    return d.toLocaleTimeString("es-CO", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/Bogota",
    });
  }

  const yesterday = new Date(now.getTime() - 86400000);
  const yesterdayBogotaStr = yesterday.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  if (dBogotaStr === yesterdayBogotaStr) {
    return "Ayer";
  }

  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays >= 0 && diffDays < 7) {
    const dayName = d.toLocaleDateString("es-CO", { weekday: "long", timeZone: "America/Bogota" });
    return dayName.charAt(0).toUpperCase() + dayName.slice(1);
  }

  return d.toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "America/Bogota",
  });
}

/**
 * Retorna la etiqueta para el separador central de fechas en el chat:
 * - "Hoy"
 * - "Ayer"
 * - "12 de octubre de 2026"
 */
export function getChatDateDivider(ts: number | string | undefined | null): string {
  const d = parseDateSafe(ts);
  const now = new Date();

  const dBogotaStr = d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const nowBogotaStr = now.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

  if (dBogotaStr === nowBogotaStr) return "Hoy";

  const yesterday = new Date(now.getTime() - 86400000);
  const yesterdayBogotaStr = yesterday.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  if (dBogotaStr === yesterdayBogotaStr) return "Ayer";

  return d.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Bogota",
  });
}

/**
 * Retorna una clave de fecha (YYYY-MM-DD en America/Bogota) para saber si cambió el día entre dos mensajes consecutivos.
 */
export function getChatDateKey(ts: number | string | undefined | null): string {
  const d = parseDateSafe(ts);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
}

/**
 * Formatea fecha y hora completa para pedidos y registros:
 * Ej: "13/10/2026, 8:45 a. m."
 */
export function formatOrderDateTime(ts: number | string | undefined | null): string {
  const d = parseDateSafe(ts);
  return d.toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Bogota",
  });
}

/**
 * Función compatible con formato anterior
 */
export function formatDateDisplay(ts: number | string | undefined): { time: string; date: string } {
  const d = parseDateSafe(ts);
  return {
    time: d.toLocaleTimeString("es-CO", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/Bogota",
    }),
    date: d.toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "America/Bogota",
    }),
  };
}
