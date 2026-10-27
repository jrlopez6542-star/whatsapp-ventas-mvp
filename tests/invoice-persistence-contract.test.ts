import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import test from "node:test";
import { belongsToInvoice, canonicalInvoicePdfUrl, ensureInvoiceForOrder, resolveDeliveredPdfUrl, resolveInvoiceNoticeDetails } from "../lib/agent/sales-agent";
import { normalizarTexto } from "../lib/contabilidad";
import {
  createOrder,
  getMemoryStore,
  getOrderInvoiceSnapshot,
  resetTursoReadyForTesting,
  setTursoClientForTesting,
  updateOrderInvoice,
  type Order,
} from "../lib/store";

const TABLA = `CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  total INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  invoice_number TEXT,
  invoice_id TEXT,
  invoice_url TEXT,
  invoice_pdf_url TEXT
)`;

interface Opciones {
  omitirUpdate?: boolean;
  fallarUpdate?: boolean;
  rowsForzado?: number;
  tercero?: (sqlite: ReturnType<typeof createClient>) => Promise<void>;
}

function envoltorio(sqlite: ReturnType<typeof createClient>, opciones: Opciones = {}) {
  return {
    batch: sqlite.batch.bind(sqlite),
    execute: async (stmt: any) => {
      const sql = typeof stmt === "string" ? stmt : stmt?.sql ?? "";
      if (/^\s*UPDATE\s+orders\s+SET\s+invoice_number/i.test(String(sql))) {
        if (opciones.fallarUpdate) throw new Error("fallo simulado de escritura");
        if (opciones.omitirUpdate) {
          if (opciones.tercero) await opciones.tercero(sqlite);
          return { rows: [], rowsAffected: 0, columns: [], columnTypes: [] };
        }
        const res = await sqlite.execute(stmt);
        if (opciones.tercero) await opciones.tercero(sqlite);
        if (opciones.rowsForzado !== undefined) {
          return { rows: [], rowsAffected: opciones.rowsForzado, columns: [], columnTypes: [] };
        }
        return res;
      }
      return sqlite.execute(stmt);
    },
  };
}

interface FilaInicial {
  number?: string;
  id?: string;
  url?: string;
  pdf?: string;
}

async function conSqlite(
  run: (sqlite: ReturnType<typeof createClient>) => Promise<void>,
  opciones: Opciones = {},
  filaInicial: FilaInicial | null = null
) {
  const sqlite = createClient({ url: "file::memory:" });
  setTursoClientForTesting(envoltorio(sqlite, opciones));
  resetTursoReadyForTesting();
  try {
    await sqlite.execute(TABLA);
    if (filaInicial) {
      await sqlite.execute({
        sql: `INSERT INTO orders (id, conversation_id, status, total, created_at, invoice_number, invoice_id, invoice_url, invoice_pdf_url)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: ["orden", "conv", "confirmed", 1000, Date.now(),
               filaInicial.number ?? null, filaInicial.id ?? null, filaInicial.url ?? null,
               filaInicial.pdf ?? null],
      });
    }
    await run(sqlite);
  } finally {
    setTursoClientForTesting(null);
    resetTursoReadyForTesting();
    await sqlite.close();
  }
}

const pedido = (id = "orden") => ({ id } as unknown as Order);

test("1. primera factura nueva: verifica las referencias durables, incluida la URL PDF", async () => {
  await conSqlite(async (sqlite) => {
    await sqlite.execute({
      sql: `INSERT INTO orders (id, conversation_id, status, total, created_at) VALUES (?, ?, ?, ?, ?)`,
      args: ["orden", "conv", "confirmed", 1000, Date.now()],
    });
    const res = await updateOrderInvoice("orden", "FV-1", "inv-1", "https://x.test/api/invoices/public/inv-1", "https://x.test/api/invoices/public/inv-1/pdf");
    assert.equal(res.status, "persisted");
    assert.deepEqual(res.preserved, []);
    assert.deepEqual(await getOrderInvoiceSnapshot("orden"), {
      invoiceNumber: "FV-1",
      invoiceId: "inv-1",
      invoiceUrl: "https://x.test/api/invoices/public/inv-1",
      invoicePdfUrl: "https://x.test/api/invoices/public/inv-1/pdf",
    });
    assert.equal(res.snapshot?.invoicePdfUrl, "https://x.test/api/invoices/public/inv-1/pdf");
  });
});

test("2. cambio de número sin invoiceId nuevo: references_incomplete y fila intacta", async () => {
  await conSqlite(async () => {
    const res = await updateOrderInvoice("orden", "FV-2");
    assert.equal(res.status, "failed");
    assert.match(String(res.error), /references_incomplete/);
    assert.deepEqual(await getOrderInvoiceSnapshot("orden"), {
      invoiceNumber: "FV-1", invoiceId: "inv-1",
      invoiceUrl: "https://x.test/u1",
      invoicePdfUrl: undefined,
    });
  }, {}, { number: "FV-1", id: "inv-1", url: "https://x.test/u1" });
});

test("3. cambio de número con id nuevo: conserva URL durable sin atribuir PDF durable", async () => {
  await conSqlite(async () => {
    const res = await updateOrderInvoice("orden", "FV-2", "inv-2");
    assert.equal(res.status, "persisted");
    assert.deepEqual(res.preserved, ["invoiceUrl"]);
    const snap = await getOrderInvoiceSnapshot("orden");
    assert.equal(snap?.invoiceNumber, "FV-2");
    assert.equal(snap?.invoiceId, "inv-2");
    assert.equal(snap?.invoiceUrl, "https://x.test/u1");
    assert.equal(snap?.invoicePdfUrl, undefined);
  }, {}, { number: "FV-1", id: "inv-1", url: "https://x.test/u1" });
});

test("4. mismo número sin id: no borra el id previo", async () => {
  await conSqlite(async () => {
    const res = await updateOrderInvoice("orden", "FV-1");
    assert.equal(res.status, "persisted");
    assert.ok(res.preserved?.includes("invoiceId"));
    assert.equal((await getOrderInvoiceSnapshot("orden"))?.invoiceId, "inv-1");
  }, {}, { number: "FV-1", id: "inv-1", url: "https://x.test/u1" });
});

test("5. URL vacía se preserva; el PDF no se declara durable", async () => {
  await conSqlite(async () => {
    for (const valor of ["", "   ", "no es url", null]) {
      const res = await updateOrderInvoice("orden", "FV-1", "inv-1", valor as any, valor as any);
      assert.equal(res.status, "persisted");
      assert.ok(res.preserved?.includes("invoiceUrl"));
      assert.equal(res.preserved?.includes("invoicePdfUrl"), false);
      const snap = await getOrderInvoiceSnapshot("orden");
      assert.equal(snap?.invoiceUrl, "https://x.test/u1");
      assert.equal(snap?.invoicePdfUrl, undefined);
    }
  }, {}, { number: "FV-1", id: "inv-1", url: "https://x.test/u1" });
});

test("6. número vacío: failed sin escribir nada", async () => {
  await conSqlite(async () => {
    const res = await updateOrderInvoice("orden", "   ");
    assert.equal(res.status, "failed");
    assert.match(String(res.error), /vacío/);
    assert.equal((await getOrderInvoiceSnapshot("orden"))?.invoiceNumber, "FV-1");
  }, {}, { number: "FV-1", id: "inv-1" });
});

test("7. discrepancia posterior: failed /no refleja/", async () => {
  await conSqlite(async (sqlite) => {
    const res = await updateOrderInvoice("orden", "FV-9", "inv-9", "https://x.test/u9");
    assert.equal(res.status, "failed");
    assert.match(String(res.error), /no refleja/i);
  }, {
    tercero: async (sqlite) => {
      await sqlite.execute({ sql: "UPDATE orders SET invoice_number = 'FV-OTRO' WHERE id = 'orden'" });
    },
  }, { number: "FV-1", id: "inv-1" });
});

test("8a. rowsAffected=0 con estado posterior igual al esperado: persisted", async () => {
  await conSqlite(async () => {
    const res = await updateOrderInvoice("orden", "FV-1");
    assert.equal(res.status, "persisted");
  }, { rowsForzado: 0 }, { number: "FV-1", id: "inv-1" });
});

test("8b. rowsAffected=0 con estado posterior igual al previo: /no refleja/", async () => {
  await conSqlite(async () => {
    const res = await updateOrderInvoice("orden", "FV-2", "inv-2");
    assert.equal(res.status, "failed");
    assert.match(String(res.error), /no refleja/i);
  }, { omitirUpdate: true }, { number: "FV-1", id: "inv-1" });
});

test("8c. rowsAffected=0 con estado distinto de previo y esperado: /cambió durante/", async () => {
  await conSqlite(async () => {
    const res = await updateOrderInvoice("orden", "FV-2", "inv-2");
    assert.equal(res.status, "failed");
    assert.match(String(res.error), /cambió durante/i);
  }, {
    omitirUpdate: true,
    tercero: async (sqlite) => {
      await sqlite.execute({ sql: "UPDATE orders SET invoice_number = 'FV-TERCERO' WHERE id = 'orden'" });
    },
  }, { number: "FV-1", id: "inv-1" });
});

test("9. reutilización durable evita POST y no supone URL PDF persistida", async () => {
  await conSqlite(async () => {
    let llamadas = 0;
    const res = await ensureInvoiceForOrder(pedido(), { orderId: "orden", items: [], total: 1000 } as any, (async () => {
      llamadas += 1;
      return { ok: true, invoiceNumber: "FV-NUEVA", invoiceId: "inv-nueva" };
    }) as any);
    assert.equal(llamadas, 0);
    assert.equal(res.reused, true);
    assert.equal(res.invoicePdfUrl, undefined, "no se asume que Turso haya guardado la URL PDF");
    assert.equal(res.persistence, undefined);
  }, {}, { number: "FV-1", id: "inv-1", url: "https://x.test/u1" });
});

test("10. fallo de validación no muta la memoria", async () => {
  setTursoClientForTesting(null);
  resetTursoReadyForTesting();
  const order = await createOrder(`mem-${Date.now()}`, [{ sku: "S", name: "n", quantity: 1, unitPrice: 100 }], 100);
  const antes = { ...getMemoryStore().orders.get(order.id)! };
  const res = await updateOrderInvoice(order.id, "");
  assert.equal(res.status, "failed");
  const despues = getMemoryStore().orders.get(order.id)!;
  assert.equal(despues.invoiceNumber, antes.invoiceNumber);
  assert.equal(despues.invoiceId, antes.invoiceId);
});

test("10b. fallo de escritura: el pedido YA estaba en memoria y no se muta", async () => {
  setTursoClientForTesting(null);
  resetTursoReadyForTesting();
  const order = await createOrder(`fallo-${Date.now()}`, [{ sku: "S", name: "n", quantity: 1, unitPrice: 100 }], 100);
  const mem = getMemoryStore().orders.get(order.id)!;
  mem.invoiceNumber = "FV-MEM";
  mem.invoiceId = "inv-mem";
  const antes = { n: mem.invoiceNumber, i: mem.invoiceId, u: mem.invoiceUrl, p: mem.invoicePdfUrl };

  const sqlite = createClient({ url: "file::memory:" });
  setTursoClientForTesting(envoltorio(sqlite, { fallarUpdate: true }));
  resetTursoReadyForTesting();
  try {
    await sqlite.execute(TABLA);
    await sqlite.execute({
      sql: `INSERT INTO orders (id, conversation_id, status, total, created_at, invoice_number, invoice_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [order.id, "conv", "confirmed", 100, Date.now(), "FV-MEM", "inv-mem"],
    });
    const res = await updateOrderInvoice(order.id, "FV-2", "inv-2");
    assert.equal(res.status, "failed");
    assert.equal(res.error, "fallo de persistencia durable");
    assert.notEqual(res.status, "persisted");
    const despues = getMemoryStore().orders.get(order.id)!;
    assert.equal(despues.invoiceNumber, antes.n);
    assert.equal(despues.invoiceId, antes.i);
    assert.equal(despues.invoiceUrl, antes.u);
    assert.equal(despues.invoicePdfUrl, antes.p);
    assert.equal((await getOrderInvoiceSnapshot(order.id))?.invoiceNumber, "FV-MEM");
  } finally {
    setTursoClientForTesting(null);
    resetTursoReadyForTesting();
    await sqlite.close();
  }
});

test("11. entrega: la URL de otra factura no se usa como propia", () => {
  assert.equal(belongsToInvoice("https://x.test/api/invoices/public/inv-1", "inv-2"), false);
  assert.equal(belongsToInvoice("https://x.test/api/invoices/public/inv-2", "inv-2"), true);
  assert.equal(belongsToInvoice("https://x.test/api/invoices/public/inv-2/pdf", "inv-2", true), true);
  assert.equal(belongsToInvoice("https://x.test/api/invoices/public/inv-2/pdf", "inv-2"), false);

  const { publicUrl } = resolveInvoiceNoticeDetails("FV-2", "https://x.test/api/invoices/public/inv-1", "inv-2");
  assert.ok(publicUrl);
  assert.match(String(publicUrl), /\/inv-2$/);
  assert.doesNotMatch(String(publicUrl), /inv-1/);
});

test("12. esquema legacy sin invoice_pdf_url: evoluciona y persiste las referencias", async () => {
  const sqlite = createClient({ url: "file::memory:" });
  setTursoClientForTesting({ batch: sqlite.batch.bind(sqlite), execute: sqlite.execute.bind(sqlite) });
  resetTursoReadyForTesting();
  try {
    await sqlite.execute(`CREATE TABLE orders (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'confirmed',
      total INTEGER NOT NULL, created_at INTEGER NOT NULL,
      invoice_number TEXT, invoice_id TEXT, invoice_url TEXT)`);
    await sqlite.execute({
      sql: `INSERT INTO orders (id, conversation_id, status, total, created_at) VALUES (?, ?, ?, ?, ?)`,
      args: ["legacy", "conv", "confirmed", 500, 1],
    });
    const res = await updateOrderInvoice("legacy", "FV-L", "inv-l", "https://x.test/u", "https://x.test/p.pdf");
    assert.equal(res.status, "persisted");
    assert.equal((await getOrderInvoiceSnapshot("legacy"))?.invoicePdfUrl, "https://x.test/p.pdf");
  } finally {
    setTursoClientForTesting(null);
    resetTursoReadyForTesting();
    await sqlite.close();
  }
});

test("13. null remoto: no borra referencias previas al persistir", async () => {
  await conSqlite(async () => {
    const res = await ensureInvoiceForOrder(
      pedido(),
      { orderId: "orden", items: [], total: 1000 } as any,
      (async () => ({ ok: true, invoiceNumber: "FV-2", invoiceId: "inv-2", invoiceUrl: null, invoicePdfUrl: null })) as any
    );
    assert.equal(res.ok, true);
    assert.equal(res.persistence, "persisted");
    const snap = await getOrderInvoiceSnapshot("orden");
    assert.equal(snap?.invoiceNumber, "FV-2");
    assert.equal(snap?.invoiceId, "inv-2");
    assert.equal(snap?.invoiceUrl, "https://x.test/u1");
    assert.equal(snap?.invoicePdfUrl, undefined);
  }, {}, { url: "https://x.test/u1" });
});

test("14. URL canónica del PDF: codifica el id una sola vez", () => {
  assert.equal(canonicalInvoicePdfUrl("inv-1"), "https://contabilidad-app-fawn.vercel.app/api/invoices/public/inv-1/pdf");
  const raro = "a/b c#d";
  const url = canonicalInvoicePdfUrl(raro);
  assert.ok(url.endsWith("/pdf"));
  assert.ok(url.includes("a%2Fb%20c%23d"));
  assert.ok(!url.includes("%252F"));
  assert.equal(belongsToInvoice(url, raro, true), true);
});

test("15. PDF entregado: canónico codificado y sin doble codificación", () => {
  assert.equal(
    resolveDeliveredPdfUrl(undefined, "inv-1"),
    "https://contabilidad-app-fawn.vercel.app/api/invoices/public/inv-1/pdf"
  );
  const raro = "a/b c#d";
  const entregado = resolveDeliveredPdfUrl(undefined, raro);
  assert.ok(entregado && entregado.includes("a%2Fb%20c%23d"));
  assert.ok(entregado && !entregado.includes("%25"));
  assert.equal(belongsToInvoice(entregado, raro, true), true);

  const ajeno = "https://contabilidad-app-fawn.vercel.app/api/invoices/public/otra/pdf";
  assert.equal(resolveDeliveredPdfUrl(ajeno, "inv-1"), canonicalInvoicePdfUrl("inv-1"));
});

test("16. normalizarTexto: null, undefined, vacíos y no textuales", () => {
  assert.equal(normalizarTexto(null), undefined);
  assert.equal(normalizarTexto(undefined), undefined);
  assert.equal(normalizarTexto(""), undefined);
  assert.equal(normalizarTexto("   "), undefined);
  assert.equal(normalizarTexto(42 as any), undefined);
  assert.equal(normalizarTexto({} as any), undefined);
  assert.equal(normalizarTexto("  FV-9  "), "FV-9");
  assert.equal(normalizarTexto("FV-9"), "FV-9");
});

test("17. rama sin Turso: rechaza número nuevo sin id y no toca memoria", async () => {
  setTursoClientForTesting(null);
  resetTursoReadyForTesting();
  const order = await createOrder(`mem-ref-${Date.now()}`, [{ sku: "S", name: "n", quantity: 1, unitPrice: 100 }], 100);
  const mem = getMemoryStore().orders.get(order.id)!;
  mem.invoiceNumber = "FV-OLD";
  mem.invoiceId = "inv-old";
  mem.invoiceUrl = "https://x.test/u-old";

  const rechazo = await updateOrderInvoice(order.id, "FV-NEW");
  assert.equal(rechazo.status, "failed");
  assert.match(String(rechazo.error), /references_incomplete/);
  assert.equal(mem.invoiceNumber, "FV-OLD");
  assert.equal(mem.invoiceId, "inv-old");
  assert.equal(mem.invoiceUrl, "https://x.test/u-old");

  const ok = await updateOrderInvoice(order.id, "FV-NEW", "inv-new", "no es url");
  assert.equal(ok.status, "memory_only");
  assert.equal(mem.invoiceNumber, "FV-NEW");
  assert.equal(mem.invoiceId, "inv-new");
  assert.equal(mem.invoiceUrl, "https://x.test/u-old");
  assert.equal(ok.snapshot?.invoiceUrl, "https://x.test/u-old");
});

test("18. rama sin Turso: pedido inexistente responde /ausente/", async () => {
  setTursoClientForTesting(null);
  resetTursoReadyForTesting();
  const res = await updateOrderInvoice(`inexistente-${Date.now()}`, "FV-X", "inv-x");
  assert.equal(res.status, "failed");
  assert.match(String(res.error), /ausente/);
});

// --- P1-P6: política de PDF por identidad de factura (post-v7) ---

test("P1. misma factura, PDF omitido: fila y memoria conservan el PDF", async () => {
  await conSqlite(async () => {
    const res = await updateOrderInvoice("orden", "FV-1", "inv-1");
    assert.equal(res.status, "persisted");
    assert.equal((await getOrderInvoiceSnapshot("orden"))?.invoicePdfUrl, "https://x.test/p1");
  }, {}, { number: "FV-1", id: "inv-1", url: "https://x.test/u1", pdf: "https://x.test/p1" });
});

test("P2. cambio de identidad: no hereda el PDF anterior", async () => {
  await conSqlite(async () => {
    const res = await updateOrderInvoice("orden", "FV-2", "inv-2", "https://x.test/u2");
    assert.equal(res.status, "persisted");
    assert.equal((await getOrderInvoiceSnapshot("orden"))?.invoicePdfUrl, undefined);
  }, {}, { number: "FV-1", id: "inv-1", url: "https://x.test/u1", pdf: "https://x.test/p1" });
});

test("P3. ID omitido, misma identidad: conserva id y PDF", async () => {
  await conSqlite(async () => {
    const res = await updateOrderInvoice("orden", "FV-1");
    assert.equal(res.status, "persisted");
    const snap = await getOrderInvoiceSnapshot("orden");
    assert.equal(snap?.invoiceId, "inv-1");
    assert.equal(snap?.invoicePdfUrl, "https://x.test/p1");
  }, {}, { number: "FV-1", id: "inv-1", pdf: "https://x.test/p1" });
});

test("P4. ID null o vacío no borra la referencia", async () => {
  await conSqlite(async () => {
    for (const valor of [null, "", "   "]) {
      const res = await updateOrderInvoice("orden", "FV-1", valor as any);
      assert.equal(res.status, "persisted");
      const snap = await getOrderInvoiceSnapshot("orden");
      assert.equal(snap?.invoiceId, "inv-1");
      assert.equal(snap?.invoicePdfUrl, "https://x.test/p1");
    }
  }, {}, { number: "FV-1", id: "inv-1", pdf: "https://x.test/p1" });
});

test("P5. ID inválido (no string) no sobrescribe la referencia", async () => {
  await conSqlite(async () => {
    const res = await updateOrderInvoice("orden", "FV-1", 42 as any);
    assert.equal(res.status, "persisted");
    assert.equal((await getOrderInvoiceSnapshot("orden"))?.invoiceId, "inv-1");
  }, {}, { number: "FV-1", id: "inv-1", pdf: "https://x.test/p1" });
});

test("P6. memoria poblada + cambio de número: sin PDF cruzado", async () => {
  setTursoClientForTesting(null);
  resetTursoReadyForTesting();
  const order = await createOrder(`p6-${Date.now()}`, [{ sku: "S", name: "n", quantity: 1, unitPrice: 100 }], 100);
  const mem = getMemoryStore().orders.get(order.id)!;
  mem.invoiceNumber = "FV-OLD"; mem.invoiceId = "inv-old"; mem.invoicePdfUrl = "https://x.test/p-old";

  const ok = await updateOrderInvoice(order.id, "FV-NEW", "inv-new", "https://x.test/u-new");
  assert.equal(ok.status, "memory_only");
  assert.equal(mem.invoiceNumber, "FV-NEW");
  assert.equal(mem.invoiceId, "inv-new");
  assert.equal(mem.invoicePdfUrl, undefined, "no se arrastra el PDF de otra factura");
});

test("D1. diagnóstico: log interno acotado y sin secretos; respuesta genérica", async () => {
  const originales = { error: console.error };
  const capturado: any[] = [];
  console.error = (...args: any[]) => { capturado.push(args); };

  const sqlite = createClient({ url: "file::memory:" });
  setTursoClientForTesting({
    batch: sqlite.batch.bind(sqlite),
    execute: async (stmt: any) => {
      const sql = typeof stmt === "string" ? stmt : stmt?.sql ?? "";
      if (/^\s*UPDATE\s+orders\s+SET\s+invoice_number/i.test(String(sql))) {
        throw new Error("fallo de escritura token=abc123 password=hunter2 " + "x".repeat(400));
      }
      return sqlite.execute(stmt);
    },
  });
  resetTursoReadyForTesting();
  try {
    await sqlite.execute(TABLA);
    await sqlite.execute({
      sql: `INSERT INTO orders (id, conversation_id, status, total, created_at) VALUES (?, ?, ?, ?, ?)`,
      args: ["orden", "conv", "confirmed", 100, Date.now()],
    });
    const res = await updateOrderInvoice("orden", "FV-1", "inv-1");
    assert.equal(res.status, "failed");
    assert.equal(res.error, "fallo de persistencia durable");
  } finally {
    console.error = originales.error;
    setTursoClientForTesting(null);
    resetTursoReadyForTesting();
    await sqlite.close();
  }

  const plano = JSON.stringify(capturado);
  assert.ok(!plano.includes("abc123"), "no debe registrar el token");
  assert.ok(!plano.includes("hunter2"), "no debe registrar la contraseña");
  assert.ok(plano.length < 800, "el detalle debe estar acotado");
});
