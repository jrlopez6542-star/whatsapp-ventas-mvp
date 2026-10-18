import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@libsql/client";
import {
  setTursoClientForTesting,
  resetTursoReadyForTesting,
  ensureTursoReady,
} from "../lib/store/db";
import { createOrder, getOrders } from "../lib/store";

test("Migración Turso: Detecta esquema legado en order_items, añade columnas faltantes y preserva datos sin DROP TABLE", async () => {
  const oldDbUrl = process.env.TURSO_DATABASE_URL;
  const oldDbToken = process.env.TURSO_AUTH_TOKEN;
  process.env.TURSO_DATABASE_URL = "libsql://mock-prod-db.turso.io";
  process.env.TURSO_AUTH_TOKEN = "mock-token";

  // Usamos una base de datos libSQL real en memoria para verificar sentencias SQL auténticas
  const client = createClient({ url: ":memory:" });
  setTursoClientForTesting(client);

  try {
    // 1. Simular base de datos preexistente con esquema legado (con qty y price, sin quantity ni unit_price)
    await client.execute(`
      CREATE TABLE order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        sku TEXT NOT NULL,
        qty INTEGER NOT NULL,
        price INTEGER NOT NULL,
        created_at INTEGER DEFAULT 0
      );
    `);

    // Insertar registros históricos reales para verificar que no se pierdan ni se corrompan
    await client.execute({
      sql: "INSERT INTO order_items (id, order_id, sku, qty, price, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: ["item-hist-1", "ord-hist-1", "C4S", 4, 18000, 1729000000000],
    });
    await client.execute({
      sql: "INSERT INTO order_items (id, order_id, sku, qty, price, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: ["item-hist-2", "ord-hist-1", "BEB_CAFE", 1, 3500, 1729000000000],
    });

    // 2. Ejecutar la migración a través de ensureTursoReady
    resetTursoReadyForTesting();
    await ensureTursoReady();

    // 3. Verificar que las columnas requeridas existen tras la inspección y alteración
    const tableInfo = await client.execute("PRAGMA table_info(order_items);");
    const cols = new Set((tableInfo.rows || []).map((r: any) => String(r.name || r[1] || "").toLowerCase()));

    assert.equal(cols.has("quantity"), true, "La columna 'quantity' debe existir en order_items");
    assert.equal(cols.has("unit_price"), true, "La columna 'unit_price' debe existir en order_items");
    assert.equal(cols.has("order_id"), true, "La columna 'order_id' debe existir en order_items");
    assert.equal(cols.has("sku"), true, "La columna 'sku' debe existir en order_items");

    // 4. Verificar que los registros históricos conservan sus valores originales
    const res = await client.execute("SELECT id, sku, quantity, unit_price FROM order_items ORDER BY id ASC;");
    assert.equal(res.rows.length, 2, "Deben conservarse exactamente los 2 registros históricos");

    const row1: any = res.rows.find((r: any) => r.id === "item-hist-1");
    assert.ok(row1, "El registro item-hist-1 debe existir");
    assert.equal(Number(row1.quantity), 4, "La cantidad migrada de qty debe ser 4");
    assert.equal(Number(row1.unit_price), 18000, "El precio unitario migrado de price debe ser 18000");

    const row2: any = res.rows.find((r: any) => r.id === "item-hist-2");
    assert.ok(row2, "El registro item-hist-2 debe existir");
    assert.equal(Number(row2.quantity), 1, "La cantidad de item-hist-2 debe ser 1");
    assert.equal(Number(row2.unit_price), 3500, "El precio unitario de item-hist-2 debe ser 3500");
  } finally {
    setTursoClientForTesting(null);
    if (oldDbUrl !== undefined) process.env.TURSO_DATABASE_URL = oldDbUrl; else delete process.env.TURSO_DATABASE_URL;
    if (oldDbToken !== undefined) process.env.TURSO_AUTH_TOKEN = oldDbToken; else delete process.env.TURSO_AUTH_TOKEN;
  }
});

test("Migración Turso: Idempotencia en migraciones repetidas sin alterar datos ni duplicar columnas", async () => {
  const oldDbUrl = process.env.TURSO_DATABASE_URL;
  const oldDbToken = process.env.TURSO_AUTH_TOKEN;
  process.env.TURSO_DATABASE_URL = "libsql://mock-prod-db.turso.io";
  process.env.TURSO_AUTH_TOKEN = "mock-token";

  const client = createClient({ url: ":memory:" });
  setTursoClientForTesting(client);

  try {
    // 1. Primera ejecución de inicialización
    resetTursoReadyForTesting();
    await ensureTursoReady();

    // Insertar un pedido real usando createOrder para validar funcionamiento
    const order = await createOrder(
      "whatsapp:+573001234567",
      [{ sku: "C8T", quantity: 2, unitPrice: 32000 }],
      64000,
      { customerName: "Cliente Idempotente", deliveryAddress: "Calle 10 # 5-20", paymentMethod: "Efectivo" }
    );
    assert.ok(order.id, "El pedido debe crearse satisfactoriamente con la nueva columna quantity");

    // 2. Segunda ejecución de ensureTursoReady (simulando arranque en frío o nueva invocación serverless)
    resetTursoReadyForTesting();
    await assert.doesNotReject(
      async () => {
        await ensureTursoReady();
      },
      "La migración repetida debe ser 100% idempotente y no lanzar error"
    );

    // 3. Tercera ejecución de ensureTursoReady
    resetTursoReadyForTesting();
    await assert.doesNotReject(
      async () => {
        await ensureTursoReady();
      },
      "La tercera ejecución no debe romper el esquema"
    );

    // Verificar que los datos del pedido y sus ítems siguen intactos
    const itemsRes = await client.execute({
      sql: "SELECT * FROM order_items WHERE order_id = ?",
      args: [order.id],
    });
    assert.equal(itemsRes.rows.length, 1, "Debe existir exactamente 1 ítem para la orden creada");
    const itemRow: any = itemsRes.rows[0];
    assert.equal(Number(itemRow.quantity), 2, "La cantidad debe ser 2");
    assert.equal(Number(itemRow.unit_price), 32000, "El precio unitario debe ser 32000");
  } finally {
    setTursoClientForTesting(null);
    if (oldDbUrl !== undefined) process.env.TURSO_DATABASE_URL = oldDbUrl; else delete process.env.TURSO_DATABASE_URL;
    if (oldDbToken !== undefined) process.env.TURSO_AUTH_TOKEN = oldDbToken; else delete process.env.TURSO_AUTH_TOKEN;
  }
});

test("Migración Turso: No silencia errores irrecuperables en ALTER TABLE", async () => {
  const oldDbUrl = process.env.TURSO_DATABASE_URL;
  const oldDbToken = process.env.TURSO_AUTH_TOKEN;
  process.env.TURSO_DATABASE_URL = "libsql://mock-prod-db.turso.io";
  process.env.TURSO_AUTH_TOKEN = "mock-token";

  // Mock que responde a PRAGMA simulando que falta quantity, pero falla en ALTER TABLE con error de disco/permisos
  setTursoClientForTesting({
    batch: async () => [{ rows: [], rowsAffected: 0 }],
    execute: async (stmt: any) => {
      const sql = typeof stmt === "string" ? stmt : stmt?.sql || "";
      if (sql.includes("PRAGMA table_info(order_items)")) {
        // Esquema sin quantity
        return {
          rows: [
            { name: "id" },
            { name: "order_id" },
            { name: "sku" },
          ],
        };
      }
      if (sql.includes("ALTER TABLE order_items ADD COLUMN quantity")) {
        throw new Error("Disk I/O error or constraint failure");
      }
      return { rows: [], rowsAffected: 0 };
    },
  });

  try {
    resetTursoReadyForTesting();
    await assert.rejects(
      async () => {
        await ensureTursoReady();
      },
      (err: any) => {
        assert.match(err.message, /Disk I\/O error or constraint failure/);
        return true;
      },
      "ensureTursoReady NO debe silenciar errores irrecuperables de migración"
    );
  } finally {
    setTursoClientForTesting(null);
    if (oldDbUrl !== undefined) process.env.TURSO_DATABASE_URL = oldDbUrl; else delete process.env.TURSO_DATABASE_URL;
    if (oldDbToken !== undefined) process.env.TURSO_AUTH_TOKEN = oldDbToken; else delete process.env.TURSO_AUTH_TOKEN;
  }
});
