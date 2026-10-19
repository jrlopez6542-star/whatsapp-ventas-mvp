import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createOrder, getOrders, updateOrderInvoice } from "../lib/store";

test("network failure leaves the local order recoverable and retry reuses its orderId", async () => {
  const simulatedInvoices = new Map<string, { invoiceId: string; invoiceNumber: string; invoiceUrl: string }>();
  const receivedBodies: Array<Record<string, unknown>> = [];
  let attempt = 0;
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      attempt += 1;
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      receivedBodies.push(body);
      const orderId = String(body.orderId);
      let invoice = simulatedInvoices.get(orderId);
      if (!invoice) {
        invoice = {
          invoiceId: `local-invoice-${orderId}`,
          invoiceNumber: "LOCAL-RECOVERY-001",
          invoiceUrl: `http://127.0.0.1/local-invoices/${orderId}`,
        };
        // Simulates a server that committed the idempotent request but lost its response.
        simulatedInvoices.set(orderId, invoice);
      }

      if (attempt === 1) {
        request.socket.destroy();
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, ...invoice, total: body.total }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const oldApiUrl = process.env.CONTABILIDAD_API_URL;
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  process.env.CONTABILIDAD_API_URL = `http://127.0.0.1:${address.port}/api/invoices/create-from-order`;

  try {
    const { createInvoiceInContabilidad } = await import("../lib/contabilidad");
    const order = await createOrder(`test:invoice-recovery-${Date.now()}`, [
      { sku: "TEST-C8", name: "Producto sintético de prueba", quantity: 1, unitPrice: 1000 },
    ], 1000, { customerName: "Cliente de prueba", paymentMethod: "Prueba", status: "confirmed" });
    const params = {
      orderId: order.id,
      customerName: "Cliente de prueba",
      paymentMethod: "Prueba",
      paymentStatus: "issued" as const,
      isCashOnDelivery: true,
      items: [{ sku: "TEST-C8", name: "Producto sintético de prueba", quantity: 1, unitPrice: 1000 }],
      total: 1000,
    };

    const first = await createInvoiceInContabilidad(params);
    assert.equal(first.ok, false, "El cliente debe conservar el fallo de red como resultado no confirmado");
    const afterFailure = (await getOrders()).find((candidate) => candidate.id === order.id);
    assert.ok(afterFailure, "El pedido debe seguir disponible para recuperación");
    assert.equal(afterFailure.invoiceId, undefined, "No se inventa una factura confirmada tras un timeout ambiguo");

    const retry = await createInvoiceInContabilidad(params);
    assert.equal(retry.ok, true);
    assert.equal(retry.invoiceId, `local-invoice-${order.id}`);
    assert.equal(receivedBodies.length, 2);
    assert.equal(receivedBodies[0].orderId, order.id);
    assert.equal(receivedBodies[1].orderId, order.id, "El reintento debe reutilizar la clave idempotente original");
    assert.equal(simulatedInvoices.size, 1, "El endpoint simulado conserva una sola factura por orderId");

    await updateOrderInvoice(order.id, retry.invoiceNumber!, retry.invoiceId, retry.invoiceUrl);
    const recovered = (await getOrders()).find((candidate) => candidate.id === order.id);
    assert.equal(recovered?.invoiceId, retry.invoiceId);
    assert.equal(recovered?.invoiceNumber, retry.invoiceNumber);
  } finally {
    if (oldApiUrl === undefined) delete process.env.CONTABILIDAD_API_URL;
    else process.env.CONTABILIDAD_API_URL = oldApiUrl;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
