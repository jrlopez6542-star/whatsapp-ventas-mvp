import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import {
  createOrder,
  getOrders,
  markOrderAccountingPaymentSynced,
  resetTursoReadyForTesting,
  setTursoClientForTesting,
  updateOrderInvoice,
} from "../lib/store";

type Scenario =
  | "invoice-http-500"
  | "invoice-timeout"
  | "invoice-http-422"
  | "invoice-malformed-success"
  | "invoice-incomplete-success"
  | "payment-http-500";
type JsonRecord = Record<string, unknown>;

let scenario: Scenario = "invoice-http-500";
let server: Server;
let baseUrl = "";
let createInvoice: (params: JsonRecord) => Promise<{
  ok: boolean;
  invoiceId?: string;
  invoiceNumber?: string;
  error?: string;
  remoteOutcome?: string;
}>;
let recordPayment: (params: JsonRecord) => Promise<{ ok: boolean; alreadyPaid?: boolean; paymentId?: string; error?: string }>;
const invoiceRecords = new Map<string, { invoiceId: string; invoiceNumber: string; invoiceUrl: string }>();
const paymentRecords = new Map<string, { paymentId: string; invoiceId: string; invoiceNumber: string }>();
const attempts = new Map<string, number>();
const receivedOrderIds: string[] = [];

function sendJson(response: import("node:http").ServerResponse, status: number, body: JsonRecord): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readRequest(request: import("node:http").IncomingMessage): Promise<JsonRecord> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as JsonRecord;
}

server = createServer((request, response) => {
  void (async () => {
    const body = await readRequest(request);
    const orderId = String(body.orderId || "");
    receivedOrderIds.push(orderId);
    const key = `${scenario}:${orderId}`;
    const attempt = (attempts.get(key) || 0) + 1;
    attempts.set(key, attempt);

    if (request.url?.endsWith("/record-payment")) {
      let payment = paymentRecords.get(orderId);
      if (!payment) {
        payment = { paymentId: `local-payment-${orderId}`, invoiceId: String(body.invoiceId || "local-invoice"), invoiceNumber: String(body.invoiceNumber || "LOCAL-001") };
        paymentRecords.set(orderId, payment);
      }
      if (scenario === "payment-http-500" && attempt === 1) {
        // Simulate a committed idempotent payment with an error response lost at the client boundary.
        sendJson(response, 500, { ok: false });
        return;
      }
      sendJson(response, 200, { ok: true, alreadyPaid: attempt > 1, ...payment, status: "paid" });
      return;
    }

    if (scenario === "invoice-http-422") {
      sendJson(response, 422, { ok: false });
      return;
    }
    if (scenario === "invoice-malformed-success") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end("{");
      return;
    }
    if (scenario === "invoice-incomplete-success") {
      sendJson(response, 200, { ok: true, invoiceNumber: "LOCAL-INCOMPLETE" });
      return;
    }

    if (scenario === "invoice-http-500" && attempt === 1) {
      sendJson(response, 500, { ok: false });
      return;
    }

    let invoice = invoiceRecords.get(orderId);
    if (!invoice) {
      invoice = {
        invoiceId: `local-invoice-${orderId}`,
        invoiceNumber: `LOCAL-${orderId.slice(0, 8)}`,
        invoiceUrl: `http://127.0.0.1/invoices/${orderId}`,
      };
      invoiceRecords.set(orderId, invoice);
    }

    if (scenario === "invoice-timeout" && attempt === 1) {
      // The simulated accounting service accepted the request but never returned a response.
      return;
    }
    sendJson(response, 200, { ok: true, ...invoice, total: body.total });
  })().catch(() => sendJson(response, 500, { ok: false }));
});

const originalContabilidadUrl = process.env.CONTABILIDAD_API_URL;
const originalPaymentUrl = process.env.CONTABILIDAD_RECORD_PAYMENT_URL;
const originalTimeout = AbortSignal.timeout;

before(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
  process.env.CONTABILIDAD_API_URL = `${baseUrl}/api/invoices/create-from-order`;
  process.env.CONTABILIDAD_RECORD_PAYMENT_URL = `${baseUrl}/api/invoices/record-payment`;
  const integration = await import("../lib/contabilidad");
  createInvoice = integration.createInvoiceInContabilidad as unknown as typeof createInvoice;
  recordPayment = integration.recordPaymentInContabilidad as unknown as typeof recordPayment;
});

after(async () => {
  AbortSignal.timeout = originalTimeout;
  setTursoClientForTesting(null);
  resetTursoReadyForTesting();
  if (originalContabilidadUrl === undefined) delete process.env.CONTABILIDAD_API_URL;
  else process.env.CONTABILIDAD_API_URL = originalContabilidadUrl;
  if (originalPaymentUrl === undefined) delete process.env.CONTABILIDAD_RECORD_PAYMENT_URL;
  else process.env.CONTABILIDAD_RECORD_PAYMENT_URL = originalPaymentUrl;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function makeOrder(conversationPrefix: string) {
  return createOrder(`${conversationPrefix}-${randomUUID()}`, [
    { sku: "LOCAL-C8", name: "Producto sintético", quantity: 1, unitPrice: 1000 },
  ], 1000, { customerName: "Cliente sintético", paymentMethod: "Prueba local", status: "confirmed" });
}

const invoiceParams = (orderId: string): JsonRecord => ({
  orderId,
  customerName: "Cliente sintético",
  paymentMethod: "Prueba local",
  paymentStatus: "issued",
  isCashOnDelivery: true,
  items: [{ sku: "LOCAL-C8", name: "Producto sintético", quantity: 1, unitPrice: 1000 }],
  total: 1000,
});

test("invoice HTTP 500 leaves order recoverable and retry creates one invoice with the same orderId", async () => {
  scenario = "invoice-http-500";
  const order = await makeOrder("test:invoice-500");
  const beforeCount = invoiceRecords.size;

  const failed = await createInvoice(invoiceParams(order.id));
  assert.equal(failed.ok, false);
  assert.match(failed.error || "", /HTTP 500/);
  assert.equal(failed.remoteOutcome, "ambiguous");
  assert.equal(invoiceRecords.has(order.id), false);
  const pending = (await getOrders()).find((candidate) => candidate.id === order.id);
  assert.ok(pending);
  assert.equal(pending.invoiceId, undefined);

  const recovered = await createInvoice(invoiceParams(order.id));
  assert.equal(recovered.ok, true);
  assert.equal(recovered.invoiceId, `local-invoice-${order.id}`);
  assert.equal(invoiceRecords.size, beforeCount + 1);
  assert.deepEqual(receivedOrderIds.slice(-2), [order.id, order.id]);
  const concurrentInvoices = await Promise.all([
    createInvoice(invoiceParams(order.id)),
    createInvoice(invoiceParams(order.id)),
  ]);
  assert.ok(concurrentInvoices.every((result) => result.ok && result.invoiceId === recovered.invoiceId));
  assert.equal(invoiceRecords.size, beforeCount + 1, "llamadas concurrentes conservan una factura en el endpoint simulado");
  assert.deepEqual(receivedOrderIds.slice(-2), [order.id, order.id]);

  await updateOrderInvoice(order.id, recovered.invoiceNumber!, recovered.invoiceId);
  const saved = (await getOrders()).find((candidate) => candidate.id === order.id);
  assert.equal(saved?.invoiceId, recovered.invoiceId);
});

test("ambiguous timeout after local invoice acceptance retries with the same orderId and recovers one invoice", async () => {
  scenario = "invoice-timeout";
  const order = await makeOrder("test:invoice-timeout");
  const beforeCount = invoiceRecords.size;
  AbortSignal.timeout = ((milliseconds: number) => originalTimeout.call(AbortSignal, Math.min(milliseconds, 300))) as typeof AbortSignal.timeout;

  const timedOut = await createInvoice(invoiceParams(order.id));
  assert.equal(timedOut.ok, false);
  assert.match(timedOut.error || "", /conexión/i);
  assert.equal(timedOut.remoteOutcome, "ambiguous");
  assert.equal(invoiceRecords.has(order.id), true, "el servicio simulado aceptó antes de perder la respuesta");
  const pending = (await getOrders()).find((candidate) => candidate.id === order.id);
  assert.ok(pending);
  assert.equal(pending.invoiceId, undefined, "BOTW no afirma éxito sin confirmación HTTP válida");

  const recovered = await createInvoice(invoiceParams(order.id));
  assert.equal(recovered.ok, true);
  assert.equal(recovered.invoiceId, `local-invoice-${order.id}`);
  assert.equal(invoiceRecords.size, beforeCount + 1);
  assert.deepEqual(receivedOrderIds.slice(-2), [order.id, order.id]);
  const concurrentInvoices = await Promise.all([
    createInvoice(invoiceParams(order.id)),
    createInvoice(invoiceParams(order.id)),
  ]);
  assert.ok(concurrentInvoices.every((result) => result.ok && result.invoiceId === recovered.invoiceId));
  assert.equal(invoiceRecords.size, beforeCount + 1, "llamadas concurrentes conservan una factura en el endpoint simulado");
  assert.deepEqual(receivedOrderIds.slice(-2), [order.id, order.id]);
});

test("invoice 4xx is a definitive rejection, while unreadable or incomplete success is ambiguous", async () => {
  const order = await makeOrder("test:invoice-outcomes");

  scenario = "invoice-http-422";
  const rejected = await createInvoice(invoiceParams(order.id));
  assert.equal(rejected.ok, false);
  assert.equal(rejected.remoteOutcome, "rejected");

  scenario = "invoice-malformed-success";
  const unreadable = await createInvoice(invoiceParams(order.id));
  assert.equal(unreadable.ok, false);
  assert.equal(unreadable.remoteOutcome, "ambiguous");

  scenario = "invoice-incomplete-success";
  const incomplete = await createInvoice(invoiceParams(order.id));
  assert.equal(incomplete.ok, false);
  assert.equal(incomplete.remoteOutcome, "ambiguous");
  assert.equal(incomplete.invoiceId, undefined, "no se inventa una referencia ausente");
});

test("payment HTTP 500 after acceptance is safe to retry and repeated calls keep one payment per orderId", async () => {
  scenario = "payment-http-500";
  const order = await makeOrder("test:payment-repeat");
  const beforeCount = paymentRecords.size;
  const params = { orderId: order.id, invoiceId: `invoice-${order.id}`, invoiceNumber: "LOCAL-PAY-001", amount: 1000, paymentMethod: "Prueba local" };

  const uncertain = await recordPayment(params);
  assert.equal(uncertain.ok, false);
  assert.match(uncertain.error || "", /HTTP 500/);
  assert.equal(paymentRecords.has(order.id), true, "el endpoint simulado confirmó internamente antes del HTTP 500");  const pendingOrder = (await getOrders()).find((candidate) => candidate.id === order.id);
  assert.ok(pendingOrder, "el pedido sigue disponible después de la respuesta ambigua");
  assert.notEqual(pendingOrder.accountingPaymentSynced, 1, "no se marca como sincronizado con HTTP 500");

  const retried = await recordPayment(params);
  assert.equal(retried.ok, true);
  assert.equal(retried.alreadyPaid, true);
  assert.equal(retried.paymentId, `local-payment-${order.id}`);
  const repeated = await recordPayment(params);
  assert.equal(repeated.ok, true);
  assert.equal(repeated.paymentId, retried.paymentId);
  assert.equal(paymentRecords.size, beforeCount + 1);
  assert.deepEqual(receivedOrderIds.slice(-3), [order.id, order.id, order.id]);  const concurrentPayments = await Promise.all([
    recordPayment(params),
    recordPayment(params),
  ]);
  assert.ok(concurrentPayments.every((result) => result.ok && result.paymentId === retried.paymentId));
  assert.equal(paymentRecords.size, beforeCount + 1, "repeticiones concurrentes mantienen un solo pago en el endpoint simulado");
  assert.deepEqual(receivedOrderIds.slice(-2), [order.id, order.id]);  assert.equal(await markOrderAccountingPaymentSynced(order.id, 2468), true);
  const recoveredOrder = (await getOrders()).find((candidate) => candidate.id === order.id);
  assert.equal(recoveredOrder?.accountingPaymentSynced, 1, "solo después de la confirmación válida queda sincronizado");
});

function fakeTursoClient(failMarkerWrite: boolean) {
  const columns = ["order_id", "sku", "name", "quantity", "unit_price", "created_at"]
    .map((name) => ({ name, type: name === "quantity" || name === "unit_price" ? "INTEGER" : "TEXT", notnull: 1, dflt_value: null, pk: 0 }));
  return {
    batch: async () => [],
    execute: async (statement: string | { sql: string }) => {
      const sql = typeof statement === "string" ? statement : statement.sql;
      if (sql === "PRAGMA table_info(order_items);") return { rows: columns, rowsAffected: 0 };
      if (/UPDATE orders\s+SET accounting_payment_synced = 1/i.test(sql)) {
        if (failMarkerWrite) throw new Error("synthetic local persistence failure");
        return { rows: [], rowsAffected: 1 };
      }
      return { rows: [], rowsAffected: 0 };
    },
  };
}

test("failed marker persistence keeps payment sync pending and a later durable write recovers it", async () => {
  const order = await makeOrder("test:payment-marker");
  try {
    setTursoClientForTesting(fakeTursoClient(true));
    const failedWrite = await markOrderAccountingPaymentSynced(order.id, 1234);
    assert.equal(failedWrite, false);
  } finally {
    setTursoClientForTesting(null);
    resetTursoReadyForTesting();
  }

  let saved = (await getOrders()).find((candidate) => candidate.id === order.id);
  assert.ok(saved);
  assert.notEqual(saved.accountingPaymentSynced, 1);

  try {
    setTursoClientForTesting(fakeTursoClient(false));
    const recoveredWrite = await markOrderAccountingPaymentSynced(order.id, 5678);
    assert.equal(recoveredWrite, true);
  } finally {
    setTursoClientForTesting(null);
    resetTursoReadyForTesting();
  }

  saved = (await getOrders()).find((candidate) => candidate.id === order.id);
  assert.equal(saved?.accountingPaymentSynced, 1);
  assert.equal(saved?.accountingPaymentSyncedAt, 5678);
});
