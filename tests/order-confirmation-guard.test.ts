import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createClient } from "@libsql/client";
import { ensureInvoiceForOrder, handleSalesMessage } from "../lib/agent/sales-agent";
import { getSessionMessages, getValidOrderConfirmationSummary, hasValidOrderConfirmation } from "../lib/agent/session-context";
import { appendMessage, createOrder, getMessages, getOrderInvoiceSnapshot, getOrders, getProducts, resetTursoReadyForTesting, setTursoClientForTesting, updateOrderInvoice } from "../lib/store";
import type { Message } from "../lib/store";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

function message(
  role: Message["role"],
  content: string,
  createdAt: number,
  deliveryStatus?: Message["deliveryStatus"]
): Message {
  return {
    id: `message-${createdAt}-${role}`,
    conversationId: "confirmation-test",
    role,
    content,
    createdAt,
    deliveryStatus,
  };
}

const orderSummary = `📋 *Resumen de tu Pedido:*
• Caja x8 Tradicional x1: $32.000
💰 *Total a pagar:* $32.000
📍 *Dirección de entrega:* Calle 8 # 10-20
💳 *Medio de pago:* Efectivo
1️⃣ ✅ Confirmar pedido
2️⃣ ✏️ Modificar algún dato`;

async function withIsolatedSqlite(
  run: (sqlite: ReturnType<typeof createClient>) => Promise<void>,
  intercept?: (statement: any) => Promise<void>
) {
  const sqlite = createClient({ url: "file::memory:" });
  const client = {
    batch: sqlite.batch.bind(sqlite),
    execute: async (statement: any) => {
      await intercept?.(statement);
      return sqlite.execute(statement);
    },
  };
  setTursoClientForTesting(client);
  resetTursoReadyForTesting();
  try {
    await run(sqlite);
  } finally {
    setTursoClientForTesting(null);
    resetTursoReadyForTesting();
    await sqlite.close();
  }
}

test("una frase de confirmación de Gemini/DeepSeek no autoriza crear el pedido sin confirmación del cliente", () => {
  const history = [message("user", "Quiero una caja tradicional", 1)];
  const assistantReply = "✅ ¡Pedido confirmado y registrado en BUÑUELANDIA!";

  assert.match(assistantReply.toLowerCase(), /pedido confirmado/);
  assert.equal(hasValidOrderConfirmation(history, "Hola"), false);
  assert.equal(hasValidOrderConfirmation(history, "confirmar"), false);
});

async function assertMockedGeminiCannotCreateWithoutSummary(): Promise<void> {
  const conversationId = `whatsapp:confirmation-gemini-${Date.now()}-${Math.random()}`;
  const oldGeminiKey = process.env.GEMINI_API_KEY;
  const oldDeepSeekKey = process.env.DEEPSEEK_API_KEY;
  const oldOpenAiKey = process.env.OPENAI_API_KEY;
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;

  process.env.GEMINI_API_KEY = "local-fake-gemini-key";
  process.env.DEEPSEEK_API_KEY = "";
  process.env.OPENAI_API_KEY = "";
  globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    providerCalls++;
    if (url.hostname === "generativelanguage.googleapis.com") {
      return new Response(JSON.stringify({
        candidates: [{ content: { role: "model", parts: [{ text: "✅ ¡Pedido confirmado y registrado en BUÑUELANDIA!" }] } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    throw new Error("Unexpected network request in local provider mock");
  };

  try {
    await appendMessage(
      conversationId,
      "user",
      "Quiero una caja tradicional de 8, Calle 8 # 10-20, pago en efectivo"
    );
    const result = await handleSalesMessage(conversationId, "Sí", "Prueba local");
    const orders = await getOrders();

    assert.ok(providerCalls > 0, "Gemini debe haberse ejecutado mediante el mock local");
    assert.match(result.reply, /Resumen de tu Pedido/);
    assert.doesNotMatch(result.reply, /Pedido Confirmado y Registrado/i);
    assert.equal(orders.some((order) => order.conversationId === conversationId), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldGeminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldGeminiKey;
    if (oldDeepSeekKey === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = oldDeepSeekKey;
    if (oldOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = oldOpenAiKey;
  }
}

test("Gemini no crea pedido al responder confirmado sin resumen previo (respuesta simulada local)", async () => {
  await assertMockedGeminiCannotCreateWithoutSummary();
});

test("solo la confirmación explícita posterior al resumen vigente queda autorizada", () => {
  const summaryHistory = [
    message("user", "Quiero una caja tradicional", 1),
    message("assistant", orderSummary, 2, "accepted"),
    message("user", "1️⃣", 3),
  ];

  assert.equal(hasValidOrderConfirmation(summaryHistory, "1️⃣"), true);
  const verbalConfirmation = [
    ...summaryHistory.slice(0, 2),
    message("user", "Confirmar", 3),
  ];
  assert.equal(hasValidOrderConfirmation(verbalConfirmation, "confirmar"), true);
});

test("cualquier mensaje del cliente después del resumen invalida su confirmación hasta presentar otro resumen", () => {
  const changesAfterSummary = [
    "Mejor una caja tradicional de 4",
    "Agrega dos cajas tradicionales",
    "Calle 12 # 20-30",
    "Mejor pagaré por Nequi",
  ];
  for (const [index, change] of changesAfterSummary.entries()) {
    const staleHistory = [
      message("user", "Quiero caja x8 tradicional, Calle 8 # 10-20, efectivo", 1),
      message("assistant", orderSummary, 2, "accepted"),
      message("user", change, 3),
      message("user", "1", 4),
    ];
    assert.equal(hasValidOrderConfirmation(staleHistory, "1"), false, `Cambio ${index + 1} debe invalidar el resumen previo`);
  }

  const staleHistory = [
    message("user", "Quiero caja x8 tradicional, Calle 8 # 10-20, efectivo", 1),
    message("assistant", orderSummary, 2, "accepted"),
    message("user", "Calle 12 # 20-30", 3),
  ];
  const refreshedHistory = [
    ...staleHistory,
    message("assistant", orderSummary.replace("Calle 8 # 10-20", "Calle 12 # 20-30"), 5, "accepted"),
    message("user", "1", 6),
  ];
  assert.equal(hasValidOrderConfirmation(refreshedHistory, "1"), true);
});

test("pending y failed no autorizan; un accepted anterior no se transfiere a un resumen nuevo", () => {
  for (const status of ["pending", "failed"] as const) {
    const history = [
      message("assistant", orderSummary, 1, status),
      message("user", "Sí", 2),
    ];
    assert.equal(hasValidOrderConfirmation(history, "Sí"), false, `${status} no debe autorizar`);
  }

  const historyWithNewPendingSummary = [
    message("assistant", orderSummary, 1, "accepted"),
    message("user", "1", 2),
    message("assistant", orderSummary.replace("Calle 8 # 10-20", "Calle 12 # 20-30"), 3, "pending"),
    message("user", "Sí", 4),
  ];
  assert.equal(hasValidOrderConfirmation(historyWithNewPendingSummary, "Sí"), false);
});

test("un reinicio de sesión y un historial sin el resumen previo no reutilizan confirmaciones", () => {
  const resetHistory = [
    message("assistant", orderSummary, 1, "accepted"),
    message("user", "1", 2),
    message("assistant", "✅ ¡Pedido confirmado y registrado!", 3),
    message("user", "1", 4),
  ];
  const newSession = getSessionMessages(resetHistory);
  assert.deepEqual(newSession.map(({ role, content }) => ({ role, content })), [{ role: "user", content: "1" }]);
  assert.equal(hasValidOrderConfirmation(newSession, "1"), false);
  assert.equal(hasValidOrderConfirmation([message("user", "1", 1)], "1"), false);
});

test("accepted y delivered autorizan únicamente su resumen actual", () => {
  for (const status of ["accepted", "delivered"] as const) {
    const history = [
      message("assistant", orderSummary, 1, status),
      message("user", "1️⃣", 2),
    ];
    assert.equal(hasValidOrderConfirmation(history, "1️⃣"), true);
  }
});

test("el respaldo muestra el resumen y no crea pedido si aún no se ha presentado uno", async () => {
  assert.equal(process.env.GEMINI_API_KEY, "");
  assert.equal(process.env.DEEPSEEK_API_KEY, "");
  assert.equal(process.env.OPENAI_API_KEY, "");
  const conversationId = `whatsapp:confirmation-no-summary-${Date.now()}-${Math.random()}`;
  await appendMessage(
    conversationId,
    "user",
    "Quiero una caja tradicional de 8, Calle 8 # 10-20, pago en efectivo"
  );

  const result = await handleSalesMessage(conversationId, "Sí", "Prueba local");
  const orders = await getOrders();

  assert.match(result.reply, /Resumen de tu Pedido/);
  assert.match(result.reply, /1️⃣ ✅ Confirmar pedido/);
  assert.equal(orders.some((order) => order.conversationId === conversationId), false);
});

test("el respaldo no crea pedido si el resumen guardado sigue pending o failed", async () => {
  assert.equal(process.env.GEMINI_API_KEY, "");
  assert.equal(process.env.DEEPSEEK_API_KEY, "");
  assert.equal(process.env.OPENAI_API_KEY, "");

  for (const deliveryStatus of ["pending", "failed"] as const) {
    const conversationId = `whatsapp:confirmation-${deliveryStatus}-${Date.now()}-${Math.random()}`;
    await appendMessage(
      conversationId,
      "user",
      "Quiero una caja tradicional de 8, Calle 8 # 10-20, pago en efectivo"
    );
    await appendMessage(conversationId, "assistant", orderSummary, { deliveryStatus });

    const result = await handleSalesMessage(conversationId, "Sí", "Prueba local");
    const orders = await getOrders();

    assert.match(result.reply, /Resumen de tu Pedido/);
    assert.equal(orders.some((order) => order.conversationId === conversationId), false);
  }
});

test("el respaldo permite crear el pedido tras confirmar el resumen vigente", async () => {
  const conversationId = `whatsapp:confirmation-valid-${Date.now()}-${Math.random()}`;
  await appendMessage(
    conversationId,
    "user",
    "Quiero una caja tradicional de 8, Calle 8 # 10-20, pago en efectivo"
  );
  await appendMessage(conversationId, "assistant", orderSummary, { deliveryStatus: "accepted" });

  const result = await handleSalesMessage(conversationId, "1", "Prueba local");
  const orders = await getOrders();

  assert.equal(result.mode, "order_created");
  assert.match(result.reply, /Pedido Confirmado/);
  assert.equal(orders.filter((order) => order.conversationId === conversationId).length, 1);
});

test("dos creaciones concurrentes con la misma confirmación comparten un pedido en SQLite aislado", async () => {
  await withIsolatedSqlite(async (sqlite) => {
    const conversationId = `confirmation-race-${Date.now()}-${Math.random()}`;
    const idempotencyKey = `${conversationId}:summary-message-42`;
    const details = {
      customerName: "Prueba local",
      deliveryAddress: "Calle de prueba",
      paymentMethod: "Efectivo",
      itemsSummary: "C8T x1",
      idempotencyKey,
    };

    const results = await Promise.all([
      createOrder(conversationId, [{ sku: "C8T", quantity: 1, unitPrice: 32000 }], 32000, details),
      createOrder(conversationId, [{ sku: "C8T", quantity: 1, unitPrice: 32000 }], 32000, details),
    ]);

    assert.equal(results[0].id, results[1].id);
    const storedOrders = await sqlite.execute({
      sql: "SELECT id FROM orders WHERE id = ?",
      args: [results[0].id],
    });
    const storedItems = await sqlite.execute({
      sql: "SELECT order_id FROM order_items WHERE order_id = ?",
      args: [results[0].id],
    });
    assert.equal(storedOrders.rows.length, 1);
    assert.equal(storedItems.rows.length, 1);

    const retry = await createOrder(
      conversationId,
      [{ sku: "C8T", quantity: 1, unitPrice: 32000 }],
      32000,
      details
    );
    assert.equal(retry.id, results[0].id);
    assert.equal(retry.idempotencyReplay, true);
    assert.equal((await getOrders()).filter((order) => order.id === results[0].id).length, 1);
  });
});

test("dos ejecuciones concurrentes de la misma confirmación del respaldo persisten un solo pedido", async () => {
  let releaseOrderReads!: () => void;
  const twoOrderReads = new Promise<void>((resolve) => { releaseOrderReads = resolve; });
  let orderReadCount = 0;

  await withIsolatedSqlite(async (sqlite) => {
    const conversationId = `confirmation-agent-race-${Date.now()}-${Math.random()}`;
    await sqlite.execute(`CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      at TEXT,
      created_at INTEGER NOT NULL,
      delivery_status TEXT DEFAULT 'pending',
      provider_message_id TEXT,
      error_details TEXT,
      updated_at INTEGER DEFAULT 0
    )`);
    await getProducts(true);
    await appendMessage(
      conversationId,
      "user",
      "Quiero una caja tradicional de 8, Calle 8 # 10-20, pago en efectivo"
    );
    await appendMessage(conversationId, "assistant", orderSummary, { deliveryStatus: "accepted" });
    await appendMessage(conversationId, "user", "1");
    const confirmationHistory = await getMessages(conversationId);
    const authorizedSummary = getValidOrderConfirmationSummary(confirmationHistory, "1");
    assert.ok(authorizedSummary, "el resumen de prueba debe estar aceptado y ser válido");
    const keyHex = createHash("sha256").update(`${conversationId}:${authorizedSummary.id}`).digest("hex").slice(0, 32);
    const expectedOrderId = `${keyHex.slice(0, 8)}-${keyHex.slice(8, 12)}-5${keyHex.slice(13, 16)}-a${keyHex.slice(17, 20)}-${keyHex.slice(20, 32)}`;

    const [first, second] = await Promise.all([
      handleSalesMessage(conversationId, "1", "Prueba local"),
      handleSalesMessage(conversationId, "1", "Prueba local"),
    ]);

    assert.equal(first.mode, "order_created");
    assert.equal(second.mode, "order_created");
    const orders = await sqlite.execute({
      sql: "SELECT id FROM orders WHERE conversation_id = ?",
      args: [conversationId],
    });
    const messages = await getMessages(conversationId);
    const summaryIds = messages
      .filter((message) => message.role === "assistant" && message.content.toLowerCase().includes("resumen de tu pedido"))
      .map((message) => message.id);
    assert.equal(orders.rows.length, 1, `Se encontraron pedidos inesperados: ${JSON.stringify({ rows: orders.rows, expectedOrderId, summaryId: authorizedSummary.id, summaryIds, messages: messages.map(({ role, content, id, deliveryStatus }) => ({ role, id, deliveryStatus, content: content.slice(0, 36) })) })}`);
  }, async (statement) => {
    const sql = typeof statement === "string" ? statement : statement?.sql;
    if (sql === "SELECT * FROM orders ORDER BY created_at DESC") {
      orderReadCount++;
      if (orderReadCount === 2) releaseOrderReads();
      await twoOrderReads;
    }
  });
});

test("Gemini, DeepSeek y respaldo usan la misma autorización antes de persistir", () => {
  const salesAgent = source("lib/agent/sales-agent.ts");
  const extractorStart = salesAgent.indexOf("async function tryExtractAndRegisterOrder(");
  const extractorEnd = salesAgent.indexOf("export async function handleSalesMessage(", extractorStart);
  const extractor = salesAgent.slice(extractorStart, extractorEnd);
  const aiCalls = [...salesAgent.matchAll(/const maybeOrder = await tryExtractAndRegisterOrder\([\s\S]*?\n\s*\);/g)];
  const fallbackConfirmation = salesAgent.indexOf("else if (isUserConfirming && hasValidCustomerConfirmation)");

  assert.match(extractor, /!hasValidCustomerConfirmation\s*\|\|\s*!isAssistantOrderConfirmation\(assistantReply\)/);
  assert.equal(aiCalls.length, 2, "Gemini y DeepSeek deben llamar al mismo extractor protegido");
  for (const call of aiCalls) {
    assert.match(call[0], /previous,\s*hasValidCustomerConfirmation/);
  }
  assert.ok(fallbackConfirmation >= 0, "El respaldo debe exigir la misma autorización de sesión");
  assert.match(salesAgent.slice(0, fallbackConfirmation), /getValidOrderConfirmationSummary\(previous, text\)/);
  assert.match(extractor, /idempotencyKey: confirmationMessageId/);
  assert.match(salesAgent.slice(fallbackConfirmation), /idempotencyKey: validConfirmationSummary/);

  const webhook = source("app/api/webhooks/evolution/route.ts");
  assert.match(salesAgent, /assistantMessageId: assistantMessage\.id/);
  assert.match(webhook, /assistantMessageId\s*\?\s*msgs\.find\(\(m\)\s*=>\s*m\.id\s*===\s*assistantMessageId\)/);
});

test("una factura guardada y completa se reutiliza sin llamar al endpoint", async () => {
  const order = await createOrder(`invoice-reuse-${Date.now()}-${Math.random()}`, [
    { sku: "TEST-C8", name: "Producto de prueba", quantity: 1, unitPrice: 1000 },
  ], 1000);
  await updateOrderInvoice(order.id, "FV-LOCAL-1001", "invoice-local-1001", "https://contabilidad-app-fawn.vercel.app/api/invoices/public/invoice-local-1001");
  let calls = 0;

  const result = await ensureInvoiceForOrder(order, {
    orderId: order.id,
    items: [{ sku: "TEST-C8", quantity: 1, unitPrice: 1000 }],
    total: 1000,
  }, async () => {
    calls++;
    return { ok: false, error: "No debía llamar al endpoint" };
  });

  assert.equal(calls, 0);
  assert.equal(result.ok, true);
  assert.equal(result.invoiceId, "invoice-local-1001");
  assert.equal(result.invoiceNumber, "FV-LOCAL-1001");
  assert.equal(result.invoiceUrl, "https://contabilidad-app-fawn.vercel.app/api/invoices/public/invoice-local-1001");
  assert.equal(order.invoiceId, result.invoiceId);
});

test("un timeout ambiguo no se guarda como factura y permite reconciliar con el mismo orderId", async () => {
  const order = await createOrder(`invoice-timeout-retry-${Date.now()}-${Math.random()}`, [
    { sku: "TEST-C8", name: "Producto de prueba", quantity: 1, unitPrice: 1000 },
  ], 1000);
  const sentOrderIds: string[] = [];
  let remoteInvoice: { invoiceId: string; invoiceNumber: string; invoiceUrl: string } | undefined;
  const createInvoice = async (params: { orderId: string }) => {
    sentOrderIds.push(params.orderId);
    if (!remoteInvoice) {
      remoteInvoice = {
        invoiceId: `invoice-${params.orderId}`,
        invoiceNumber: "FV-LOCAL-RETRY",
        invoiceUrl: `https://contabilidad-app-fawn.vercel.app/api/invoices/public/invoice-${params.orderId}`,
      };
      return { ok: false, error: "timeout ambiguo" };
    }
    return { ok: true, ...remoteInvoice };
  };
  const params = { orderId: order.id, items: [{ quantity: 1, unitPrice: 1000 }], total: 1000 };

  const first = await ensureInvoiceForOrder(order, params, createInvoice);
  assert.equal(first.ok, false);
  assert.equal((await getOrderInvoiceSnapshot(order.id))?.invoiceId, undefined);

  const recovered = await ensureInvoiceForOrder(order, params, createInvoice);
  assert.equal(recovered.ok, true);
  assert.ok(remoteInvoice);
  const expectedInvoice = remoteInvoice;
  assert.deepEqual(sentOrderIds, [order.id, order.id]);
  assert.equal(recovered.invoiceId, expectedInvoice.invoiceId);
  assert.equal(recovered.invoiceUrl, expectedInvoice.invoiceUrl);
  assert.equal((await getOrderInvoiceSnapshot(order.id))?.invoiceId, expectedInvoice.invoiceId);
});

test("una respuesta HTTP fallida no se confunde con una factura guardada", async () => {
  const order = await createOrder(`invoice-http-error-${Date.now()}-${Math.random()}`, [
    { sku: "TEST-C8", name: "Producto de prueba", quantity: 1, unitPrice: 1000 },
  ], 1000);
  const params = { orderId: order.id, items: [{ quantity: 1, unitPrice: 1000 }], total: 1000 };

  const failed = await ensureInvoiceForOrder(order, params, async () => ({
    ok: false,
    invoiceId: "unconfirmed-invoice-id",
    invoiceNumber: "UNCONFIRMED-001",
    invoiceUrl: "https://contabilidad-app-fawn.vercel.app/api/invoices/public/unconfirmed-invoice-id",
    error: "HTTP 500",
  }));
  assert.equal(failed.ok, false);
  assert.equal((await getOrderInvoiceSnapshot(order.id))?.invoiceId, undefined);

  const recovered = await ensureInvoiceForOrder(order, params, async ({ orderId }) => ({
    ok: true,
    invoiceId: `invoice-${orderId}`,
    invoiceNumber: "FV-RECOVERED-500",
    invoiceUrl: `https://contabilidad-app-fawn.vercel.app/api/invoices/public/invoice-${orderId}`,
  }));
  assert.equal(recovered.ok, true);
  assert.equal(recovered.invoiceId, `invoice-${order.id}`);
  assert.equal((await getOrderInvoiceSnapshot(order.id))?.invoiceId, `invoice-${order.id}`);
});

test("dos solicitudes locales concurrentes comparten la misma creación de factura", async () => {
  const order = await createOrder(`invoice-concurrent-${Date.now()}-${Math.random()}`, [
    { sku: "TEST-C8", name: "Producto de prueba", quantity: 1, unitPrice: 1000 },
  ], 1000);
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const createInvoice = async (params: { orderId: string }) => {
    calls++;
    await gate;
    return {
      ok: true,
      invoiceId: `invoice-${params.orderId}`,
      invoiceNumber: "FV-LOCAL-CONCURRENT",
      invoiceUrl: `https://contabilidad-app-fawn.vercel.app/api/invoices/public/invoice-${params.orderId}`,
    };
  };
  const params = { orderId: order.id, items: [{ quantity: 1, unitPrice: 1000 }], total: 1000 };

  const first = ensureInvoiceForOrder(order, params, createInvoice);
  const secondOrder = { ...order };
  const second = ensureInvoiceForOrder(secondOrder, params, createInvoice);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  release();
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(firstResult.invoiceId, secondResult.invoiceId);
  assert.equal(firstResult.invoiceUrl, secondResult.invoiceUrl);
  assert.equal(secondOrder.invoiceId, firstResult.invoiceId);
  assert.equal(calls, 1);
});

test("extractor y respaldo determinista usan el mismo helper de reutilización de factura", () => {
  const salesAgent = source("lib/agent/sales-agent.ts");
  const extractorStart = salesAgent.indexOf("async function tryExtractAndRegisterOrder(");
  const extractorEnd = salesAgent.indexOf("export async function handleSalesMessage(", extractorStart);
  const extractor = salesAgent.slice(extractorStart, extractorEnd);
  const fallbackStart = salesAgent.indexOf("else if (isUserConfirming && hasValidCustomerConfirmation)");
  const fallback = salesAgent.slice(fallbackStart);

  assert.match(extractor, /ensureInvoiceForOrder\(order,/);
  assert.match(fallback, /ensureInvoiceForOrder\(order,/);
  assert.doesNotMatch(extractor, /createInvoiceInContabilidad\(/);
  assert.doesNotMatch(fallback, /createInvoiceInContabilidad\(/);
});
