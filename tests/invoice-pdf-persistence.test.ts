import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import test from "node:test";
import {
  createOrder,
  getMemoryStore,
  getOrderInvoiceSnapshot,
  getOrders,
  resetTursoReadyForTesting,
  setTursoClientForTesting,
  updateOrderInvoice,
} from "../lib/store";

async function withIsolatedSqlite(run: (sqlite: ReturnType<typeof createClient>) => Promise<void>) {
  const sqlite = createClient({ url: "file::memory:" });
  const client = {
    batch: sqlite.batch.bind(sqlite),
    execute: sqlite.execute.bind(sqlite),
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

test("invoice PDF URL persists through schema evolution, snapshot, and fresh order reads", async () => {
  await withIsolatedSqlite(async (sqlite) => {
    // Simulate a pre-existing local orders table and row without invoice_pdf_url.
    await sqlite.execute(`CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'confirmed',
      total INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      invoice_number TEXT,
      invoice_id TEXT,
      invoice_url TEXT
    )`);
    await sqlite.execute({
      sql: `INSERT INTO orders (id, conversation_id, status, total, created_at, invoice_number, invoice_id, invoice_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: ["legacy-invoice-order", "test-conversation", "confirmed", 1200, 1, "FV-OLD", "inv-old", "https://example.test/invoice"],
    });

    const persisted = await updateOrderInvoice(
      "legacy-invoice-order",
      "FV-NEW",
      "inv-new",
      "https://example.test/invoice-new",
      "https://example.test/invoice-new.pdf"
    );

    const saved = await getOrderInvoiceSnapshot("legacy-invoice-order");
    assert.deepEqual(saved, {
      invoiceNumber: "FV-NEW",
      invoiceId: "inv-new",
      invoiceUrl: "https://example.test/invoice-new",
      invoicePdfUrl: "https://example.test/invoice-new.pdf",
    });
    assert.equal(persisted.snapshot?.invoicePdfUrl, "https://example.test/invoice-new.pdf");
    const reread = (await getOrders()).find((order) => order.id === "legacy-invoice-order");
    assert.equal(reread?.invoicePdfUrl, "https://example.test/invoice-new.pdf");

    await updateOrderInvoice("legacy-invoice-order", "FV-NEW", "inv-new", "https://example.test/invoice-new", "not a valid URL");
    const partial = await getOrderInvoiceSnapshot("legacy-invoice-order");
    assert.deepEqual(partial, {
      invoiceNumber: "FV-NEW",
      invoiceId: "inv-new",
      invoiceUrl: "https://example.test/invoice-new",
      invoicePdfUrl: "https://example.test/invoice-new.pdf",
    });

    await sqlite.execute({
      sql: `INSERT INTO orders (id, conversation_id, status, total, created_at) VALUES (?, ?, ?, ?, ?)`,
      args: ["legacy-no-pdf-order", "test-conversation", "confirmed", 500, 2],
    });
    const oldOrder = await getOrderInvoiceSnapshot("legacy-no-pdf-order");
    assert.deepEqual(oldOrder, {
      invoiceNumber: undefined,
      invoiceId: undefined,
      invoiceUrl: undefined,
      invoicePdfUrl: undefined,
    });
  });
});

test("memory mode stores and retains invoice PDF URL while keeping other invoice fields", async () => {
  setTursoClientForTesting(null);
  resetTursoReadyForTesting();
  const order = await createOrder(`invoice-pdf-memory-${Date.now()}`, [
    { sku: "TEST", name: "Prueba", quantity: 1, unitPrice: 700 },
  ], 700);

  await updateOrderInvoice(order.id, "FV-MEM", "inv-mem", "https://example.test/mem", "https://example.test/mem.pdf");
  await updateOrderInvoice(order.id, "FV-MEM-2", "inv-mem", "https://example.test/mem-2", "not a valid URL");

  assert.deepEqual(await getOrderInvoiceSnapshot(order.id), {
    invoiceNumber: "FV-MEM-2",
    invoiceId: "inv-mem",
    invoiceUrl: "https://example.test/mem-2",
    invoicePdfUrl: "https://example.test/mem.pdf",
  });
  assert.equal(getMemoryStore().orders.get(order.id)?.invoicePdfUrl, "https://example.test/mem.pdf");
});
