import assert from "node:assert/strict";
import test from "node:test";
import {
  isPhoneWhitelisted,
  normalizePhoneForComparison,
  isTestMode,
} from "../lib/security-whitelist";
import {
  sendOutboundWhatsApp,
  sendOutboundWhatsAppMedia,
} from "../lib/whatsapp-send";
import {
  verifyEvolutionWebhookSecret,
  parseEvolutionMessageUpdate,
} from "../lib/evolution";
import {
  validateTursoEnvironmentAccess,
  isTursoConfigured,
  getTursoClient,
  setTursoClientForTesting,
} from "../lib/store/db";
import {
  claimOrderDriverNotification,
  appendMessage,
  getMessages,
  updateMessageDeliveryStatus,
  updateMessageDeliveryStatusByProviderId,
} from "../lib/store";
import {
  claimWebhookEventDetailed,
  completeWebhookEvent,
  failWebhookEvent,
  resetWebhookDedupeForTesting,
  PROCESSING_LOCK_TIMEOUT_MS,
} from "../lib/webhook-dedupe";

test("1. TEST_PHONE_WHITELIST: Bloqueo por defecto (Fail-Closed) cuando falta o está vacía en modo prueba", () => {
  const origTestMode = process.env.TEST_MODE;
  const origWhitelist = process.env.TEST_PHONE_WHITELIST;

  try {
    process.env.TEST_MODE = "true";
    delete process.env.TEST_PHONE_WHITELIST;

    assert.equal(isTestMode(), true);
    const res1 = isPhoneWhitelisted("3001234567");
    assert.equal(res1.allowed, false, "Debe bloquear si no hay lista en modo prueba");
    assert.equal(res1.reason, "empty_or_missing_whitelist");

    process.env.TEST_PHONE_WHITELIST = "   ";
    const res2 = isPhoneWhitelisted("3001234567");
    assert.equal(res2.allowed, false, "Debe bloquear si la lista está vacía en modo prueba");
    assert.equal(res2.reason, "empty_or_missing_whitelist");
  } finally {
    process.env.TEST_MODE = origTestMode;
    process.env.TEST_PHONE_WHITELIST = origWhitelist;
  }
});

test("2. TEST_PHONE_WHITELIST: Validación exhaustiva de números autorizados y no autorizados", () => {
  const origTestMode = process.env.TEST_MODE;
  const origWhitelist = process.env.TEST_PHONE_WHITELIST;

  try {
    process.env.TEST_MODE = "true";
    process.env.TEST_PHONE_WHITELIST = "3001234567, +57 310 987 6543, 888777@lid";

    // Casos autorizados con distintas variantes de formato
    assert.equal(isPhoneWhitelisted("3001234567").allowed, true);
    assert.equal(isPhoneWhitelisted("+573001234567").allowed, true);
    assert.equal(isPhoneWhitelisted("whatsapp:+573001234567").allowed, true);
    assert.equal(isPhoneWhitelisted("573001234567@s.whatsapp.net").allowed, true);
    assert.equal(isPhoneWhitelisted("3109876543").allowed, true);
    assert.equal(isPhoneWhitelisted("573109876543").allowed, true);
    assert.equal(isPhoneWhitelisted("whatsapp:lid:888777").allowed, true);
    assert.equal(isPhoneWhitelisted("888777@lid").allowed, true);

    // Casos no autorizados
    const unauth1 = isPhoneWhitelisted("3150001122");
    assert.equal(unauth1.allowed, false);
    assert.equal(unauth1.reason, "not_in_whitelist");

    const unauth2 = isPhoneWhitelisted("whatsapp:+573189990000");
    assert.equal(unauth2.allowed, false);
    assert.equal(unauth2.reason, "not_in_whitelist");

    const unauth3 = isPhoneWhitelisted("999000@lid");
    assert.equal(unauth3.allowed, false);
    assert.equal(unauth3.reason, "not_in_whitelist");
  } finally {
    process.env.TEST_MODE = origTestMode;
    process.env.TEST_PHONE_WHITELIST = origWhitelist;
  }
});

test("3. TEST_PHONE_WHITELIST en salidas: sendOutboundWhatsApp y sendOutboundWhatsAppMedia bloquean destinatarios no autorizados", async () => {
  const origTestMode = process.env.TEST_MODE;
  const origWhitelist = process.env.TEST_PHONE_WHITELIST;

  try {
    process.env.TEST_MODE = "true";
    process.env.TEST_PHONE_WHITELIST = "3001234567";

    // Intento de envío de texto a número no autorizado
    const textRes = await sendOutboundWhatsApp("3159998877", "Hola, pedido confirmado");
    assert.equal(textRes.ok, false);
    assert.match(textRes.error, /no autorizado por lista blanca/i);

    // Intento de envío multimedia a número no autorizado
    const mediaRes = await sendOutboundWhatsAppMedia("3159998877", "https://ejemplo.com/qr.png", "QR de pago");
    assert.equal(mediaRes.ok, false);
    assert.match(mediaRes.error, /no autorizado por lista blanca/i);
  } finally {
    process.env.TEST_MODE = origTestMode;
    process.env.TEST_PHONE_WHITELIST = origWhitelist;
  }
});

test("4. EVOLUTION_WEBHOOK_SECRET: Obligatorio en entornos desplegados y comparación segura", () => {
  const origNodeEnv = process.env.NODE_ENV;
  const origVercelEnv = process.env.VERCEL_ENV;
  const origSecret = process.env.EVOLUTION_WEBHOOK_SECRET;

  try {
    // Simular entorno desplegado de producción
    (process.env as any).NODE_ENV = "production";
    delete process.env.VERCEL_ENV;
    delete process.env.EVOLUTION_WEBHOOK_SECRET;

    // Sin secreto configurado en producción debe rechazar de inmediato (Fail-Closed)
    assert.equal(verifyEvolutionWebhookSecret(null), false);
    assert.equal(verifyEvolutionWebhookSecret("un-secreto-cualquiera"), false);

    // Simular entorno Preview
    (process.env as any).NODE_ENV = "test";
    process.env.VERCEL_ENV = "preview";
    assert.equal(verifyEvolutionWebhookSecret("un-secreto-cualquiera"), false);

    // Con secreto configurado
    process.env.EVOLUTION_WEBHOOK_SECRET = "super-secret-token-12345";
    assert.equal(verifyEvolutionWebhookSecret("super-secret-token-12345"), true);
    assert.equal(verifyEvolutionWebhookSecret("wrong-token"), false);
    assert.equal(verifyEvolutionWebhookSecret(""), false);
    assert.equal(verifyEvolutionWebhookSecret(null), false);
  } finally {
    (process.env as any).NODE_ENV = origNodeEnv;
    process.env.VERCEL_ENV = origVercelEnv;
    process.env.EVOLUTION_WEBHOOK_SECRET = origSecret;
  }
});

test("5. Aislamiento de Turso en Preview: Rechaza conexión a producción y exige configuración explícita", () => {
  const origVercelEnv = process.env.VERCEL_ENV;
  const origTursoEnv = process.env.TURSO_ENVIRONMENT;
  const origAllow = process.env.ALLOW_TURSO_IN_PREVIEW;

  try {
    process.env.VERCEL_ENV = "preview";
    delete process.env.TURSO_ENVIRONMENT;
    delete process.env.ALLOW_TURSO_IN_PREVIEW;

    // 1. Preview sin autorización explícita debe ser rechazado
    const check1 = validateTursoEnvironmentAccess("libsql://bunuelandia-staging.turso.io");
    assert.equal(check1.allowed, false);
    assert.match(check1.reason || "", /sin configuración explícita/i);

    // 2. Preview con autorización explícita pero URL con indicadores de producción debe ser rechazado
    process.env.TURSO_ENVIRONMENT = "sandbox";
    const check2 = validateTursoEnvironmentAccess("libsql://bunuelandia-prod.turso.io");
    assert.equal(check2.allowed, false);
    assert.match(check2.reason || "", /indicadores de producción/i);

    const check3 = validateTursoEnvironmentAccess("libsql://prod-database.turso.io");
    assert.equal(check3.allowed, false);
    assert.match(check3.reason || "", /indicadores de producción/i);

    // 3. Preview con autorización explícita y base de sandbox debe ser permitido
    const check4 = validateTursoEnvironmentAccess("libsql://bunuelandia-test-sandbox.turso.io");
    assert.equal(check4.allowed, true);
  } finally {
    process.env.VERCEL_ENV = origVercelEnv;
    process.env.TURSO_ENVIRONMENT = origTursoEnv;
    process.env.ALLOW_TURSO_IN_PREVIEW = origAllow;
  }
});

test("6. claimOrderDriverNotification: Error de persistencia retorna false y no asume éxito", async () => {
  // Simular cliente de Turso que falla al ejecutar la consulta SQL
  const failingClient = {
    execute: async () => {
      throw new Error("Simulated Turso network timeout during driver claim");
    },
    batch: async () => {
      throw new Error("Simulated Turso network timeout");
    },
  };

  setTursoClientForTesting(failingClient);

  try {
    const testOrderId = `ord-fail-${Date.now()}`;
    const claimed = await claimOrderDriverNotification(testOrderId, "initial", false);
    assert.equal(claimed, false, "Si la base de datos falla, claimOrderDriverNotification DEBE retornar false");
  } finally {
    setTursoClientForTesting(null);
  }
});

test("7. Webhook Deduplication: Estados processing, completed y reintentos recuperables", async () => {
  resetWebhookDedupeForTesting();

  const eventId = `evt-test-${Date.now()}`;

  // 1. Primer reclamo: Debe ser aceptado como nuevo
  const claim1 = await claimWebhookEventDetailed(eventId);
  assert.equal(claim1.claimed, true);
  assert.equal(claim1.reason, "new");
  assert.equal(claim1.status, "processing");

  // 2. Reclamo concurrente mientras sigue activo: Debe ser BLOQUEADO (still_processing)
  const claim2 = await claimWebhookEventDetailed(eventId);
  assert.equal(claim2.claimed, false);
  assert.equal(claim2.reason, "still_processing");

  // 3. Marcar evento como completado exitosamente con id de pedido
  await completeWebhookEvent(eventId, { orderId: "ord-abc-123" });

  // 4. Intento posterior: Debe ser BLOQUEADO como ya completado (already_completed)
  const claim3 = await claimWebhookEventDetailed(eventId);
  assert.equal(claim3.claimed, false);
  assert.equal(claim3.reason, "already_completed");
  assert.equal(claim3.orderId, "ord-abc-123");

  // 5. Evento fallido: Permite reintento controlado
  const failEventId = `evt-fail-${Date.now()}`;
  const claimF1 = await claimWebhookEventDetailed(failEventId);
  assert.equal(claimF1.claimed, true);

  await failWebhookEvent(failEventId, "LLM timeout error");

  const claimF2 = await claimWebhookEventDetailed(failEventId);
  assert.equal(claimF2.claimed, true);
  assert.equal(claimF2.reason, "retry_after_failure");
});

test("8. Trazabilidad de mensajes salientes: pending -> accepted -> delivered y reporte de fallos", async () => {
  const convId = `conv-trace-${Date.now()}`;

  // 1. Mensaje nuevo inicia en estado pending
  const msg = await appendMessage(convId, "assistant", "Tu pedido está listo", {
    deliveryStatus: "pending",
  });
  assert.equal(msg.deliveryStatus, "pending");

  // 2. Al ser aceptado por el proveedor, se actualiza a accepted con providerMessageId
  await updateMessageDeliveryStatus(msg.id, "accepted", {
    providerMessageId: "prov_msg_9988",
  });

  const msgsAfterSend = await getMessages(convId);
  const foundMsg = msgsAfterSend.find((m) => m.id === msg.id);
  assert.ok(foundMsg);
  assert.equal(foundMsg.deliveryStatus, "accepted");
  assert.equal(foundMsg.providerMessageId, "prov_msg_9988");

  // 3. Al recibir confirmación del webhook de Evolution (MESSAGES_UPDATE), pasa a delivered
  await updateMessageDeliveryStatusByProviderId("prov_msg_9988", "delivered");

  const msgsAfterDelivery = await getMessages(convId);
  const deliveredMsg = msgsAfterDelivery.find((m) => m.id === msg.id);
  assert.ok(deliveredMsg);
  assert.equal(deliveredMsg.deliveryStatus, "delivered");

  // 4. Mensaje con fallo de envío
  const failMsg = await appendMessage(convId, "assistant", "Mensaje que fallará", {
    deliveryStatus: "pending",
  });
  await updateMessageDeliveryStatus(failMsg.id, "failed", {
    errorDetails: "Evolution API instance disconnected",
  });

  const msgsFail = await getMessages(convId);
  const foundFailed = msgsFail.find((m) => m.id === failMsg.id);
  assert.ok(foundFailed);
  assert.equal(foundFailed.deliveryStatus, "failed");
  assert.match(foundFailed.errorDetails || "", /instance disconnected/i);
});

test("9. Parser de mensajes de actualización de Evolution (MESSAGES_UPDATE)", () => {
  // Confirmación de entrega
  const deliveryPayload = {
    event: "messages.update",
    data: [
      {
        key: { id: "msg-ext-100", remoteJid: "573001234567@s.whatsapp.net" },
        update: { status: "DELIVERY_ACK" },
      },
    ],
  };
  const parsed1 = parseEvolutionMessageUpdate(deliveryPayload);
  assert.ok(parsed1);
  assert.equal(parsed1.messageId, "msg-ext-100");
  assert.equal(parsed1.status, "delivered");

  // Confirmación de lectura
  const readPayload = {
    event: "messages.update",
    data: [
      {
        key: { id: "msg-ext-200", remoteJid: "573001234567@s.whatsapp.net" },
        update: { status: "READ" },
      },
    ],
  };
  const parsed2 = parseEvolutionMessageUpdate(readPayload);
  assert.ok(parsed2);
  assert.equal(parsed2.messageId, "msg-ext-200");
  assert.equal(parsed2.status, "read");

  // Evento que no es de actualización
  const upsertPayload = {
    event: "messages.upsert",
    data: { key: { id: "msg-ext-300" } },
  };
  assert.equal(parseEvolutionMessageUpdate(upsertPayload), null);
});
