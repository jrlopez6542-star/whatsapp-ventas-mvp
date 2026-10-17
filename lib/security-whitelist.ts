/**
 * Control de lista blanca de teléfonos para entornos de prueba y sandbox (TEST_PHONE_WHITELIST).
 * En modo de pruebas, solo los números explícitamente autorizados pueden enviar mensajes entrantes
 * o recibir mensajes salientes (texto, multimedia y notificaciones a domiciliarios).
 */

import { logSystemEvent } from "@/lib/logger";

export interface WhitelistCheckResult {
  allowed: boolean;
  reason?: "not_in_whitelist" | "empty_or_missing_whitelist" | "invalid_target";
  normalizedTarget?: string;
}

/**
 * Determina si el entorno actual se encuentra en modo de pruebas / sandbox.
 */
export function isTestMode(): boolean {
  return (
    process.env.TEST_MODE === "true" ||
    process.env.WHATSAPP_TEST_MODE === "true" ||
    process.env.VERCEL_ENV === "preview"
  );
}

/**
 * Normaliza un número de teléfono o identificador de WhatsApp para comparación segura.
 * Maneja números colombianos (10 dígitos o 12 dígitos con 57) e identificadores @lid.
 */
export function normalizePhoneForComparison(raw: string): string {
  if (!raw) return "";
  const trimmed = raw.trim().toLowerCase();

  // Caso 1: Identificador LID (@lid o whatsapp:lid:)
  if (trimmed.includes("@lid") || trimmed.includes("lid:")) {
    const lidDigits = trimmed.replace(/^(?:whatsapp:)?(?:lid:)?/, "").replace(/@lid$/, "").replace(/\D/g, "");
    return lidDigits ? `${lidDigits}@lid` : trimmed;
  }

  // Caso 2: Número con dígitos
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return trimmed;

  // Si tiene 12 dígitos y empieza por 573, extraer los 10 dígitos colombianos
  if (digits.length === 12 && digits.startsWith("573")) {
    return digits.slice(2);
  }

  // Si tiene 10 dígitos y empieza por 3, es el número móvil estándar
  if (digits.length === 10 && digits.startsWith("3")) {
    return digits;
  }

  return digits;
}

/**
 * Obtiene la lista de números autorizados en TEST_PHONE_WHITELIST.
 */
export function getWhitelistedPhones(): Set<string> {
  const envRaw = process.env.TEST_PHONE_WHITELIST?.trim();
  if (!envRaw) return new Set();

  const entries = envRaw
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  const normalizedSet = new Set<string>();
  for (const entry of entries) {
    const norm = normalizePhoneForComparison(entry);
    if (norm) {
      normalizedSet.add(norm);
      // Agregar versión con prefijo 57 si es móvil de 10 dígitos para máxima cobertura
      if (norm.length === 10 && norm.startsWith("3")) {
        normalizedSet.add(`57${norm}`);
      }
    }
  }

  return normalizedSet;
}

/**
 * Verifica si un destinatario o remitente está autorizado.
 * - En modo de pruebas: Si la lista falta o está vacía, BLOQUEA POR DEFECTO (Fail-Closed).
 * - En producción general (sin modo de pruebas y sin lista configurada): Permite el tráfico.
 * - Si TEST_PHONE_WHITELIST está configurado con valores (incluso fuera de test mode): Exige coincidencia.
 */
export function isPhoneWhitelisted(target: string): WhitelistCheckResult {
  if (!target || typeof target !== "string") {
    return { allowed: false, reason: "invalid_target" };
  }

  const inTestMode = isTestMode();
  const rawWhitelist = process.env.TEST_PHONE_WHITELIST?.trim();
  const hasConfiguredWhitelist = Boolean(rawWhitelist);

  // Regla 1: En modo de pruebas, si la lista falta o está vacía, bloquear por defecto
  if (inTestMode && !hasConfiguredWhitelist) {
    return { allowed: false, reason: "empty_or_missing_whitelist" };
  }

  // Regla 2: Si no estamos en modo de pruebas y no se configuró lista blanca, permitir todo
  if (!inTestMode && !hasConfiguredWhitelist) {
    return { allowed: true };
  }

  // Regla 3: Si hay lista configurada (o estamos en modo pruebas con lista), validar contra la lista
  const allowedSet = getWhitelistedPhones();
  if (allowedSet.size === 0) {
    return { allowed: false, reason: "empty_or_missing_whitelist" };
  }

  const normTarget = normalizePhoneForComparison(target);
  const rawDigits = target.replace(/\D/g, "");

  const isAllowed =
    allowedSet.has(normTarget) ||
    allowedSet.has(rawDigits) ||
    (rawDigits.length === 12 && rawDigits.startsWith("57") && allowedSet.has(rawDigits.slice(2))) ||
    (rawDigits.length === 10 && allowedSet.has(`57${rawDigits}`));

  if (!isAllowed) {
    return { allowed: false, reason: "not_in_whitelist", normalizedTarget: normTarget };
  }

  return { allowed: true, normalizedTarget: normTarget };
}

/**
 * Helper para registrar en auditoría el bloqueo de un número no autorizado sin revelar secretos ni datos sensibles.
 */
export function logWhitelistRejection(direction: "inbound" | "outbound", target: string, reason?: string): void {
  const norm = normalizePhoneForComparison(target);
  const masked = norm.length > 4 ? `***${norm.slice(-4)}` : "***";
  console.warn(`[security-whitelist] Mensaje ${direction} bloqueado (${reason || "no autorizado"}): ${masked}`);
  logSystemEvent(
    "warn",
    "whatsapp",
    `Mensaje ${direction} bloqueado por lista blanca de pruebas (${reason || "no autorizado"})`,
    { direction, reason, targetMasked: masked }
  );
}
