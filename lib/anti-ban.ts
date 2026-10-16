/**
 * Anti-Ban & Humanization Engine for WhatsApp (Evolution API / Baileys).
 *
 * Implements Meta heuristic safeguards:
 * 1. Human typing presence ('composing') broadcast before sending.
 * 2. Dynamic character-weighted delays with realistic reading + typing phases.
 * 3. Infinite loop & flood circuit breaker (prevents bot-to-bot endless loops).
 * 4. Duplicate outbound message suppression within short timeframes.
 * 5. Lexical rotation for static fallback phrases (anti-fingerprinting).
 */

import { sendEvolutionPresence } from "@/lib/evolution";
import { setConversationStatus } from "@/lib/store";
import { logSystemEvent } from "@/lib/logger";

export interface HumanDelays {
  readingDelayMs: number;
  typingDelayMs: number;
  totalDelayMs: number;
}

// Ventana de control de inundación: máximo 6 mensajes del bot cada 60s por chat
const FLOOD_WINDOW_MS = 60_000;
const MAX_MESSAGES_PER_WINDOW = 6;
const DUPLICATE_SUPPRESS_WINDOW_MS = 15_000;

// Estado en memoria por proceso
const outboundTimestampsByConv = new Map<string, number[]>();
const lastSentMessageByConv = new Map<string, { bodyHash: string; timestamp: number }>();

/**
 * Calcula tiempos de espera realistas indistinguibles de un humano escribiendo.
 * - Fase 1: Lectura/pensamiento (300ms - 700ms)
 * - Fase 2: Tipeo activo 'composing' (~15-22ms por carácter con jitter)
 */
export function calculateHumanDelays(
  textLength: number,
  customMin?: number,
  customMax?: number
): HumanDelays {
  // Entorno de pruebas o fast-reply explícito
  if (
    process.env.TEST_FAST_REPLY === "true" ||
    (process.env.NODE_ENV === "test" && !process.env.TEST_SIMULATE_HUMAN)
  ) {
    return {
      readingDelayMs: 50,
      typingDelayMs: 200,
      totalDelayMs: 250,
    };
  }

  // Si el usuario especificó límites manuales estrictos por ENV
  if (typeof customMin === "number" && typeof customMax === "number" && customMax > 0) {
    const min = Math.min(customMin, customMax);
    const max = Math.max(customMin, customMax);
    const total = min + Math.floor(Math.random() * (max - min + 1));
    const reading = Math.min(500, Math.floor(total * 0.25));
    return {
      readingDelayMs: reading,
      typingDelayMs: Math.max(200, total - reading),
      totalDelayMs: total,
    };
  }

  // Cálculo humano orgánico:
  // Lectura humana: 1.2s a 2.2s (1200ms a 2200ms)
  const readingDelayMs = 1200 + Math.floor(Math.random() * 1000);

  // Tipeo humano: presencia 'composing' proporcional a la longitud del texto
  const typingDelayMs = Math.min(6000, Math.max(1800, textLength * 32));

  return {
    readingDelayMs,
    typingDelayMs,
    totalDelayMs: readingDelayMs + typingDelayMs,
  };
}

/**
 * Verifica si se ha disparado el Circuit Breaker por exceso de velocidad o bucle infinito.
 * Si un contestador automático del cliente o un bot responde en bucle, esto frena
 * el intercambio antes de que WhatsApp detecte tráfico automatizado de alta frecuencia.
 */
export async function checkOutboundRateLimit(
  conversationKey: string
): Promise<{ allowed: boolean; reason?: string }> {
  const now = Date.now();
  const history = (outboundTimestampsByConv.get(conversationKey) || []).filter(
    (ts) => now - ts < FLOOD_WINDOW_MS
  );

  if (history.length >= MAX_MESSAGES_PER_WINDOW) {
    console.warn(`[anti-ban] Circuit breaker tripped for ${conversationKey}. Too many messages in window (${history.length}/${MAX_MESSAGES_PER_WINDOW}).`);
    
    // Auto-pausar la conversación en la base de datos
    await setConversationStatus(conversationKey, "human").catch(() => {});
    
    logSystemEvent(
      "warn",
      "agent",
      `🛡️ Anti-Ban: Bucle infinito o spam detenido para ${conversationKey}. Bot pausado automáticamente.`,
      { conversationKey, count: history.length }
    );

    return {
      allowed: false,
      reason: `Anti-Ban: Superado límite de seguridad (${history.length} msgs/min). Bot pausado para proteger la línea.`,
    };
  }

  return { allowed: true };
}

/**
 * Comprueba si este mensaje exacto acaba de ser enviado hace menos de 15 segundos
 * (prevención de reintentos duplicados por fallos temporales de red o webhooks duplicados).
 */
export function isDuplicateOutbound(conversationKey: string, body: string): boolean {
  const now = Date.now();
  const normalized = body.trim().replace(/\s+/g, " ");
  const last = lastSentMessageByConv.get(conversationKey);

  if (last && last.bodyHash === normalized && now - last.timestamp < DUPLICATE_SUPPRESS_WINDOW_MS) {
    console.warn(`[anti-ban] Duplicate outbound suppressed for ${conversationKey}`);
    return true;
  }

  return false;
}

/**
 * Registra un envío exitoso para la ventana deslizante y deduplicación.
 */
export function recordOutboundSent(conversationKey: string, body: string): void {
  const now = Date.now();
  const history = (outboundTimestampsByConv.get(conversationKey) || []).filter(
    (ts) => now - ts < FLOOD_WINDOW_MS
  );
  history.push(now);
  outboundTimestampsByConv.set(conversationKey, history);

  const normalized = body.trim().replace(/\s+/g, " ");
  lastSentMessageByConv.set(conversationKey, {
    bodyHash: normalized,
    timestamp: now,
  });
}

/**
 * Simula la presencia humana completa:
 * 1. Pausa de lectura (ver mensaje)
 * 2. Emisión de presencia 'composing' (Escribiendo...)
 * 3. Tiempo de tipeo según longitud
 */
export async function simulateHumanPresence(
  to: string,
  delays: HumanDelays
): Promise<void> {
  // Pausa de lectura inicial
  if (delays.readingDelayMs > 0) {
    await new Promise((r) => setTimeout(r, delays.readingDelayMs));
  }

  // Notificar 'composing' a WhatsApp vía Evolution API
  await sendEvolutionPresence(to, "composing", delays.typingDelayMs).catch(() => {});

  // Pausa de tipeo
  if (delays.typingDelayMs > 0) {
    await new Promise((r) => setTimeout(r, delays.typingDelayMs));
  }
}

/**
 * Selecciona una variación aleatoria para textos fijos del sistema,
 * evitando que Meta detecte hashes idénticos en respuestas automáticas repetitivas.
 */
export function pickRandomVariation(phrases: string[]): string {
  if (!phrases || phrases.length === 0) return "";
  const index = Math.floor(Math.random() * phrases.length);
  return phrases[index];
}
