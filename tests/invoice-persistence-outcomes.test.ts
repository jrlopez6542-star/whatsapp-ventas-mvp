import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import test from "node:test";
import { ensureInvoiceForOrder, isConfirmedInvoiceReference } from "../lib/agent/sales-agent";
import type { CreateInvoiceParams } from "../lib/contabilidad";
import {
  getOrderInvoiceSnapshot,
  resetTursoReadyForTesting,
  setTursoClientForTesting,
  updateOrderInvoice,
  type Order,
} from "../lib/store";

const TABLA_ORDERS = `CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  total INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  invoice_number TEXT,
  invoice_id TEXT,
  invoice_url TEXT
)`;

function clienteEnvoltorio(sqlite: ReturnType<typeof createClient>, omitirUpdate = false, fallarUpdate = false) {
  return {
    batch: sqlite.batch.bind(sqlite),
    execute: async (stmt: any) => {
      const sql = typeof stmt === "string" ? stmt : stmt?.sql ?? "";
      if (/^\s*UPDATE\s+orders\s+SET\s+invoice_number/i.test(String(sql))) {
        if (fallarUpdate) throw new Error("fallo simulado de escritura");
        if (omitirUpdate) return { rows: [], rowsAffected: 0, columns: [], columnTypes: [] };
      }
      return sqlite.execute(stmt);
    },
  };
}

async function conSqlite(
  run: (sqlite: ReturnType<typeof createClient>) => Promise<void>,
  opciones: { omitirUpdate?: boolean; fallarUpdate?: boolean } = {}
) {
  const sqlite = createClient({ url: "file::memory:" });
  setTursoClientForTesting(clienteEnvoltorio(sqlite, opciones.omitirUpdate, opciones.fallarUpdate));
  resetTursoReadyForTesting();
  try {
    await sqlite.execute(TABLA_ORDERS);
    await run(sqlite);
  } finally {
    setTursoClientForTesting(null);
    resetTursoReadyForTesting();
    await sqlite.close();
  }
}

function pedido(id: string): Order {
  return { id } as unknown as Order;
}

function params(orderId: string): CreateInvoiceParams {
  return {
    orderId,
    items: [{ sku: "C4S", name: "Caja", quantity: 1, unitPrice: 12000 }],
    total: 12000,
  };
}

async function insertarPedido(sqlite: ReturnType<typeof createClient>, id: string) {
  await sqlite.execute({
    sql: `INSERT INTO orders (id, conversation_id, status, total, created_at) VALUES (?, ?, ?, ?, ?)`,
    args: [id, "conv-test", "confirmed", 12000, Date.now()],
  });
}

test("persistencia confirmada: el UPDATE deja la fila coherente", async () => {
  await conSqlite(async (sqlite) => {
    await insertarPedido(sqlite, "orden-persistida");

    const res = await updateOrderInvoice(
      "orden-persistida",
      "FV-1001",
      "inv-1001",
      "https://ejemplo.test/fv-1001",
      "https://ejemplo.test/fv-1001.pdf"
    );

    assert.equal(res.status, "persisted");
    assert.equal(res.error, undefined);
    assert.deepEqual(await getOrderInvoiceSnapshot("orden-persistida"), {
      invoiceNumber: "FV-1001",
      invoiceId: "inv-1001",
      invoiceUrl: "https://ejemplo.test/fv-1001",
      invoicePdfUrl: "https://ejemplo.test/fv-1001.pdf",
    });
    assert.equal(res.snapshot?.invoicePdfUrl, "https://ejemplo.test/fv-1001.pdf");
  });
});

test("fila ausente: el UPDATE no persiste y se reporta fallo", async () => {
  await conSqlite(async () => {
    const res = await updateOrderInvoice("orden-inexistente", "FV-2002", "inv-2002");

    assert.equal(res.status, "failed");
    assert.match(String(res.error), /ausente/i);
    assert.equal(res.snapshot, null);
  });
});

test("fila discrepante: si el UPDATE no deja los datos pedidos, se reporta fallo", async () => {
  await conSqlite(
    async (sqlite) => {
      await insertarPedido(sqlite, "orden-discrepante");

      const res = await updateOrderInvoice("orden-discrepante", "FV-3003", "inv-3003");

      assert.equal(res.status, "failed");
      assert.match(String(res.error), /no refleja/i);
      assert.equal(res.snapshot?.invoiceNumber, undefined);
    },
    { omitirUpdate: true }
  );
});

test("fallo de guardado tras creación remota: se conserva la referencia y no se repite el POST", async () => {
  await conSqlite(
    async (sqlite) => {
      await insertarPedido(sqlite, "orden-sin-guardado");
      let llamadas = 0;
      const crearFactura = async () => {
        llamadas += 1;
        return {
    ok: true as const,
          invoiceNumber: "FV-4004",
          invoiceId: "inv-4004",
          invoiceUrl: "https://ejemplo.test/fv-4004",
        };
      };

      const primero = await ensureInvoiceForOrder(
        pedido("orden-sin-guardado"),
        params("orden-sin-guardado"),
        crearFactura as any
      );
      assert.equal(primero.ok, true);
      assert.equal(primero.invoiceNumber, "FV-4004");
      assert.equal(primero.persistence, "failed");
      assert.equal(llamadas, 1);

      // Segundo intento: reintenta el GUARDADO, no la creación remota.
      const segundo = await ensureInvoiceForOrder(
        pedido("orden-sin-guardado"),
        params("orden-sin-guardado"),
        crearFactura as any
      );
      assert.equal(llamadas, 1, "no debe repetirse el POST");
      assert.equal(segundo.invoiceNumber, "FV-4004");
      assert.equal(segundo.persistence, "failed");
    },
    { fallarUpdate: true }
  );
});

test("reutilización: una referencia ya guardada evita la creación remota", async () => {
  await conSqlite(async (sqlite) => {
    await insertarPedido(sqlite, "orden-reutilizada");
    await updateOrderInvoice("orden-reutilizada", "FV-5005", "inv-5005", "https://ejemplo.test/fv-5005");
    let llamadas = 0;
    const crearFactura = async () => {
      llamadas += 1;
      return { ok: true, invoiceNumber: "FV-NUEVA", invoiceId: "inv-nueva" };
    };

    const res = await ensureInvoiceForOrder(
      pedido("orden-reutilizada"),
      params("orden-reutilizada"),
      crearFactura as any
    );

    assert.equal(llamadas, 0, "no debe crearse una factura nueva");
    assert.equal(res.reused, true);
    assert.equal(res.invoiceNumber, "FV-5005");
    assert.equal(res.persistence, undefined);
  });
});

test("rechazo remoto y resultado ambiguo se distinguen sin escribir en la fila", async () => {
  await conSqlite(async (sqlite) => {
    await insertarPedido(sqlite, "orden-rechazo");
    await insertarPedido(sqlite, "orden-ambiguo");

    const rechazo = await ensureInvoiceForOrder(
      pedido("orden-rechazo"),
      params("orden-rechazo"),
      (async () => ({ ok: false, error: "HTTP 422", remoteOutcome: "rejected" })) as any
    );
    assert.equal(rechazo.ok, false);
    assert.equal(rechazo.remoteOutcome, "rejected");
    assert.equal(rechazo.persistence, undefined);
    assert.equal((await getOrderInvoiceSnapshot("orden-rechazo"))?.invoiceNumber, undefined);

    const ambiguo = await ensureInvoiceForOrder(
      pedido("orden-ambiguo"),
      params("orden-ambiguo"),
      (async () => ({ ok: false, error: "Fallo de conexión", remoteOutcome: "ambiguous" })) as any
    );
    assert.equal(ambiguo.ok, false);
    assert.equal(ambiguo.remoteOutcome, "ambiguous");
    assert.equal(ambiguo.persistence, undefined);
    assert.equal((await getOrderInvoiceSnapshot("orden-ambiguo"))?.invoiceNumber, undefined);
  });
});

test("solo resultados remotos confirmados pueden presentarse y ambos flujos usan el mismo guard", () => {
  const invoice = {
    ok: true as const,
    invoiceNumber: "FV-6006",
    invoiceId: "inv-6006",
    remoteOutcome: "created" as const,
  };
  for (const state of ["reused", "created_persisted", "created_memory_only", "created_not_persisted"] as const) {
    assert.equal(isConfirmedInvoiceReference({ ...invoice, state }), true, `${state} conserva una referencia confirmada`);
  }
  for (const [state, remoteOutcome] of [
    ["remote_rejected", "rejected"],
    ["remote_ambiguous", "ambiguous"],
    ["not_attempted", "not_attempted"],
    ["local_read_failed", "not_attempted"],
  ] as const) {
    assert.equal(isConfirmedInvoiceReference({ ...invoice, ok: false, state, remoteOutcome }), false, state);
  }

  const source = readFileSync(join(process.cwd(), "lib/agent/sales-agent.ts"), "utf8");
  const extractorStart = source.indexOf("async function tryExtractAndRegisterOrder(");
  const extractorEnd = source.indexOf("export async function handleSalesMessage(", extractorStart);
  const extractor = source.slice(extractorStart, extractorEnd);
  const fallbackStart = source.indexOf('else if (isUserConfirming && hasValidCustomerConfirmation)');
  const fallback = source.slice(fallbackStart);
  assert.match(extractor, /isConfirmedInvoiceReference\(invRes\)/);
  assert.match(extractor, /invoiceId:\s*invRes\.invoiceId/);
  assert.match(fallback, /const invPresentable = isConfirmedInvoiceReference\(invRes\)/);
});
