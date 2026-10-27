import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { CreateInvoiceParams } from "../lib/contabilidad";

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  CONTABILIDAD_API_URL: process.env.CONTABILIDAD_API_URL,
  CONTABILIDAD_API_KEY: process.env.CONTABILIDAD_API_KEY,
};

Object.assign(process.env, {
  NODE_ENV: "test",
  // resolveContabilidadApiUrl() solo acepta URLs de loopback en runtime de pruebas.
  CONTABILIDAD_API_URL: "http://127.0.0.1:9/api/invoices/create-from-order",
  CONTABILIDAD_API_KEY: "clave-de-prueba",
});

after(() => {
  if (originalEnv.NODE_ENV !== undefined) {
    Object.assign(process.env, { NODE_ENV: originalEnv.NODE_ENV });
  } else {
    Reflect.deleteProperty(process.env, "NODE_ENV");
  }
  if (originalEnv.CONTABILIDAD_API_URL !== undefined) {
    process.env.CONTABILIDAD_API_URL = originalEnv.CONTABILIDAD_API_URL;
  } else {
    delete process.env.CONTABILIDAD_API_URL;
  }
  if (originalEnv.CONTABILIDAD_API_KEY !== undefined) {
    process.env.CONTABILIDAD_API_KEY = originalEnv.CONTABILIDAD_API_KEY;
  } else {
    delete process.env.CONTABILIDAD_API_KEY;
  }
});

const params: CreateInvoiceParams = {
  orderId: "orden-1",
  items: [{ sku: "S", name: "n", quantity: 1, unitPrice: 100 }],
  total: 100,
};

async function conRespuesta(payload: unknown) {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  try {
    const { createInvoiceInContabilidad } = await import("../lib/contabilidad");
    return await createInvoiceInContabilidad(params);
  } finally {
    globalThis.fetch = original;
  }
}

test("C1. ok:true sin invoiceId ⇒ ambiguo, sin inventar referencia", async () => {
  const res = await conRespuesta({ ok: true, invoiceNumber: "FV-1" });
  assert.equal(res.ok, false);
  assert.equal(res.remoteOutcome, "ambiguous");
  assert.equal(res.invoiceId, undefined);
});

test("C2. ok:true sin invoiceNumber ⇒ ambiguo", async () => {
  const res = await conRespuesta({ ok: true, invoiceId: "inv-1" });
  assert.equal(res.ok, false);
  assert.equal(res.remoteOutcome, "ambiguous");
  assert.equal(res.invoiceNumber, undefined);
});

test("C3. ok:true sin ninguna referencia ⇒ ambiguo", async () => {
  const res = await conRespuesta({ ok: true });
  assert.equal(res.ok, false);
  assert.equal(res.remoteOutcome, "ambiguous");
});

test("C4. ok:true completo ⇒ created con las dos referencias", async () => {
  const res = await conRespuesta({ ok: true, invoiceNumber: "FV-1", invoiceId: "inv-1" });
  assert.equal(res.ok, true);
  assert.equal(res.remoteOutcome, "created");
  assert.equal(res.invoiceNumber, "FV-1");
  assert.equal(res.invoiceId, "inv-1");
});

test("C5. ok:false ⇒ rejected sin referencias", async () => {
  const res = await conRespuesta({ ok: false, error: "rechazo" });
  assert.equal(res.ok, false);
  assert.equal(res.remoteOutcome, "rejected");
});
