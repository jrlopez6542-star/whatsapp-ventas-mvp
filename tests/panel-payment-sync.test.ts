import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { NextRequest } from "next/server";
import { createOrder, getOrders, markOrderDriverPaymentConfirmed } from "../lib/store";
import { createSession, createUser } from "../lib/auth/session";

type SimulatorMode = "success" | "commit-timeout-once" | "http-500" | "wrong-invoice" | "wrong-amount" | "invalid-shape";
type Payment = { paymentId: string; orderId: string; invoiceId: string; invoiceNumber: string; amount: number };

let server: Server;
let baseUrl = "";
let patchOrder: typeof import("../app/api/panel/orders/[id]/route").PATCH;
let sessionCookie = "";
let mode: SimulatorMode = "success";
const payments = new Map<string, Payment>();
const attempts = new Map<string, number>();
const receivedOrderIds: string[] = [];
const oldPaymentUrl = process.env.CONTABILIDAD_RECORD_PAYMENT_URL;
const originalTimeout = AbortSignal.timeout;

async function readBody(request: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function json(response: import("node:http").ServerResponse, status: number, value: object) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

before(async () => {
  server = createServer((request, response) => {
    void (async () => {
      const body = await readBody(request);
      const orderId = String(body.orderId || "");
      receivedOrderIds.push(orderId);
      const attempt = (attempts.get(orderId) || 0) + 1;
      attempts.set(orderId, attempt);
      let payment = payments.get(orderId);
      if (!payment) {
        payment = {
          paymentId: `local-payment-${orderId}`,
          orderId,
          invoiceId: String(body.invoiceId || ""),
          invoiceNumber: String(body.invoiceNumber || ""),
          amount: Number(body.amount),
        };
        payments.set(orderId, payment);
      }

      if (mode === "commit-timeout-once" && attempt === 1) return;
      if (mode === "http-500") {
        json(response, 500, { ok: false, error: "simulated server error" });
        return;
      }
      if (mode === "invalid-shape") {
        json(response, 200, {
          ok: "false",
          status: "paid",
          paymentId: payment.paymentId,
          invoiceId: payment.invoiceId,
          invoiceNumber: payment.invoiceNumber,
          total: payment.amount + 5000,
        });
        return;
      }

      const result = {
        ok: true,
        alreadyPaid: attempt > 1,
        ...payment,
        total: payment.amount + 5000,
        amount: mode === "wrong-amount" ? payment.amount + 100 : payment.amount,
        invoiceId: mode === "wrong-invoice" ? "different-invoice" : payment.invoiceId,
        status: "paid",
      };
      json(response, 200, result);
    })().catch(() => json(response, 500, { ok: false }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
  process.env.CONTABILIDAD_RECORD_PAYMENT_URL = `${baseUrl}/api/invoices/record-payment`;

  const user = await createUser({
    email: `payment-sync-${randomUUID()}@bunuelandia.co`,
    password: "LocalTestPassword123!",
    name: "Panel Sync Tester",
    role: "admin",
  });
  const session = await createSession(user.id);
  sessionCookie = `panel_session=${session.token}`;
  patchOrder = (await import("../app/api/panel/orders/[id]/route")).PATCH;
});

after(async () => {
  AbortSignal.timeout = originalTimeout;
  if (oldPaymentUrl === undefined) delete process.env.CONTABILIDAD_RECORD_PAYMENT_URL;
  else process.env.CONTABILIDAD_RECORD_PAYMENT_URL = oldPaymentUrl;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function newCashOrder(options: { invoice?: boolean } = {}) {
  const id = randomUUID();
  return createOrder(`test:panel-payment-sync:${id}`, [], 42000, {
    paymentMethod: "Efectivo contra entrega",
    status: "delivering",
    ...(options.invoice === false ? {} : { invoiceId: `invoice-${id}`, invoiceNumber: `FV-${id.slice(0, 8)}` }),
  });
}

async function deliver(orderId: string) {
  const request = new NextRequest(`http://localhost/api/panel/orders/${orderId}`, {
    method: "PATCH",
    headers: { cookie: sessionCookie, "content-type": "application/json" },
    body: JSON.stringify({ status: "delivered", notifyCustomer: false }),
  });
  const response = await patchOrder(request, { params: Promise.resolve({ id: orderId }) });
  return { response, data: await response.json() };
}

test("panel confirms locally, syncs once, and repeated confirmation reuses the completed result", async () => {
  mode = "success";
  const order = await newCashOrder();
  const paymentsBefore = payments.size;
  const first = await deliver(order.id);
  assert.equal(first.response.status, 200);
  assert.equal(first.data.paymentSynced, true);
  assert.equal(first.data.order.driverPaymentConfirmed, 1);
  assert.equal(first.data.order.driverPaymentAmount, 42000);
  assert.equal(first.data.order.accountingPaymentSynced, 1);
  assert.equal(payments.get(order.id)?.amount, 42000);
  assert.equal(receivedOrderIds.filter((id) => id === order.id).length, 1);

  const repeated = await deliver(order.id);
  assert.equal(repeated.data.paymentSynced, true);
  assert.equal(receivedOrderIds.filter((id) => id === order.id).length, 1);
  assert.equal(payments.size, paymentsBefore + 1);
});

test("ambiguous timeout is reconciled by retrying the same orderId and persisted payment", async () => {
  mode = "commit-timeout-once";
  const order = await newCashOrder();
  const paymentsBefore = payments.size;
  AbortSignal.timeout = ((milliseconds: number) => originalTimeout.call(AbortSignal, Math.min(milliseconds, 40))) as typeof AbortSignal.timeout;
  const first = await deliver(order.id);
  assert.equal(first.response.status, 200);
  assert.equal(first.data.paymentSynced, false);
  assert.match(first.data.warning, /pendiente para reintentar/);
  assert.equal(first.data.order.driverPaymentConfirmed, 1);
  assert.notEqual(first.data.order.accountingPaymentSynced, 1);
  assert.equal(payments.size, paymentsBefore + 1);

  AbortSignal.timeout = originalTimeout;
  const retry = await deliver(order.id);
  assert.equal(retry.data.paymentSynced, true);
  assert.equal(payments.size, paymentsBefore + 1, "el retry no crea un pago contable duplicado");
  assert.deepEqual(receivedOrderIds.slice(-2), [order.id, order.id]);
  assert.equal(retry.data.order.accountingPaymentSynced, 1);
});

test("HTTP failure leaves the local payment confirmed and the accounting marker pending", async () => {
  mode = "http-500";
  const order = await newCashOrder();
  const result = await deliver(order.id);
  assert.equal(result.response.status, 200);
  assert.equal(result.data.paymentSynced, false);
  assert.match(result.data.warning, /HTTP 500/);
  assert.equal(result.data.order.driverPaymentConfirmed, 1);
  assert.notEqual(result.data.order.accountingPaymentSynced, 1);
  assert.equal(payments.has(order.id), true);
});

test("a response with a different invoice or applied amount remains pending", async () => {
  const invoiceMismatch = await newCashOrder();
  mode = "wrong-invoice";
  const wrongInvoiceResponse = await deliver(invoiceMismatch.id);
  assert.equal(wrongInvoiceResponse.data.paymentSynced, false);
  assert.match(wrongInvoiceResponse.data.warning, /no coincide/);
  assert.notEqual(wrongInvoiceResponse.data.order.accountingPaymentSynced, 1);

  const amountMismatch = await newCashOrder();
  mode = "wrong-amount";
  const wrongAmountResponse = await deliver(amountMismatch.id);
  assert.equal(wrongAmountResponse.data.paymentSynced, false);
  assert.match(wrongAmountResponse.data.warning, /no coincide/);
  assert.notEqual(wrongAmountResponse.data.order.accountingPaymentSynced, 1);
});

test("a malformed success response is not treated as a confirmed accounting payment", async () => {
  mode = "invalid-shape";
  const order = await newCashOrder();
  const result = await deliver(order.id);
  assert.equal(result.data.paymentSynced, false);
  assert.match(result.data.warning, /no confirmó|no coincide/);
  assert.notEqual(result.data.order.accountingPaymentSynced, 1);
});

test("concurrent panel requests share one in-flight sync and one simulated payment", async () => {
  mode = "success";
  const order = await newCashOrder();
  const beforeCount = receivedOrderIds.filter((id) => id === order.id).length;
  const [first, second] = await Promise.all([deliver(order.id), deliver(order.id)]);
  assert.equal(first.data.paymentSynced, true);
  assert.equal(second.data.paymentSynced, true);
  assert.equal(receivedOrderIds.filter((id) => id === order.id).length - beforeCount, 1);
  assert.equal(payments.has(order.id), true);
});

test("missing invoice data or amount keeps the local confirmation pending without a request", async () => {
  mode = "success";
  const noInvoice = await newCashOrder({ invoice: false });
  const beforeNoInvoice = receivedOrderIds.length;
  const missingInvoiceResult = await deliver(noInvoice.id);
  assert.equal(missingInvoiceResult.data.paymentSynced, false);
  assert.match(missingInvoiceResult.data.warning, /no tiene invoiceId ni número/);
  assert.equal(receivedOrderIds.length, beforeNoInvoice);
  assert.equal((await getOrders()).find((item) => item.id === noInvoice.id)?.driverPaymentConfirmed, 1);

  const noAmount = await createOrder(`test:missing-amount:${randomUUID()}`, [], 42000, {
    paymentMethod: "Efectivo",
    status: "delivered",
    invoiceId: "invoice-missing-amount",
    invoiceNumber: "FV-MISSING-AMOUNT",
  });
  await markOrderDriverPaymentConfirmed(noAmount.id, { amount: 0, phone: "panel-admin", confirmedAt: Date.now() });
  const beforeNoAmount = receivedOrderIds.length;
  const missingAmountResult = await deliver(noAmount.id);
  assert.equal(missingAmountResult.data.paymentSynced, false);
  assert.match(missingAmountResult.data.warning, /importe válido/);
  assert.equal(receivedOrderIds.length, beforeNoAmount);
});

test("unavailable Contabilidad leaves the BOTW payment confirmed and sync pending", async () => {
  const order = await newCashOrder();
  process.env.CONTABILIDAD_RECORD_PAYMENT_URL = "http://127.0.0.1:1/api/invoices/record-payment";
  const result = await deliver(order.id);
  assert.equal(result.data.paymentSynced, false);
  assert.match(result.data.warning, /pendiente para reintentar/);
  assert.equal(result.data.order.driverPaymentConfirmed, 1);
  assert.notEqual(result.data.order.accountingPaymentSynced, 1);
  assert.equal(payments.has(order.id), false);
  process.env.CONTABILIDAD_RECORD_PAYMENT_URL = `${baseUrl}/api/invoices/record-payment`;
});
