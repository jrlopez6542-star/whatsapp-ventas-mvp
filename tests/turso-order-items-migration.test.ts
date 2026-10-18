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

test("Migración Turso: createOrder es compatible con esquemas legados que tenían qty/price con restricción NOT NULL", async () => {
  const oldDbUrl = process.env.TURSO_DATABASE_URL;
  const oldDbToken = process.env.TURSO_AUTH_TOKEN;
  process.env.TURSO_DATABASE_URL = "libsql://mock-prod-db.turso.io";
  process.env.TURSO_AUTH_TOKEN = "mock-token";

  const client = createClient({ url: ":memory:" });
  setTursoClientForTesting(client);

  try {
    // 1. Crear tabla previa con qty y price con NOT NULL (sin quantity ni unit_price)
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

    // 2. Ejecutar migración
    resetTursoReadyForTesting();
    await ensureTursoReady();

    // 3. Crear pedido usando createOrder
    const order = await createOrder(
      "whatsapp:+573001234567",
      [{ sku: "C4S", quantity: 3, unitPrice: 15000 }],
      45000,
      { customerName: "Cliente Compatible", deliveryAddress: "Calle 1 # 2-3", paymentMethod: "Efectivo" }
    );

    assert.ok(order.id, "El pedido debe crearse exitosamente");

    // 4. Verificar que el item se guardó correctamente y tanto quantity como qty tienen el valor esperado
    const res = await client.execute({
      sql: "SELECT * FROM order_items WHERE order_id = ?",
      args: [order.id],
    });
    assert.equal(res.rows.length, 1, "Debe existir 1 ítem");
    const item: any = res.rows[0];
    assert.equal(Number(item.quantity), 3, "quantity debe ser 3");
    assert.equal(Number(item.qty), 3, "qty heredado debe ser 3");
    assert.equal(Number(item.unit_price), 15000, "unit_price debe ser 15000");
    assert.equal(Number(item.price), 15000, "price heredado debe ser 15000");
  } finally {
    setTursoClientForTesting(null);
    if (oldDbUrl !== undefined) process.env.TURSO_DATABASE_URL = oldDbUrl; else delete process.env.TURSO_DATABASE_URL;
    if (oldDbToken !== undefined) process.env.TURSO_AUTH_TOKEN = oldDbToken; else delete process.env.TURSO_AUTH_TOKEN;
  }
});

test("Migración Turso: createOrder es compatible con esquemas legados que tenían count y price", async () => {
  const oldDbUrl = process.env.TURSO_DATABASE_URL;
  const oldDbToken = process.env.TURSO_AUTH_TOKEN;
  process.env.TURSO_DATABASE_URL = "libsql://mock-prod-db.turso.io";
  process.env.TURSO_AUTH_TOKEN = "mock-token";

  const client = createClient({ url: ":memory:" });
  setTursoClientForTesting(client);

  try {
    await client.execute(`
      CREATE TABLE order_items (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        sku TEXT NOT NULL,
        count INTEGER NOT NULL,
        price INTEGER NOT NULL,
        created_at INTEGER DEFAULT 0
      );
    `);

    resetTursoReadyForTesting();
    await ensureTursoReady();

    const order = await createOrder(
      "whatsapp:+573001234567",
      [{ sku: "C8S", quantity: 2, unitPrice: 32000 }],
      64000,
      { customerName: "Cliente Count", deliveryAddress: "Calle 2 # 4-6", paymentMethod: "Efectivo" }
    );

    assert.ok(order.id, "El pedido debe crearse exitosamente");

    const res = await client.execute({
      sql: "SELECT * FROM order_items WHERE order_id = ?",
      args: [order.id],
    });
    assert.equal(res.rows.length, 1, "Debe existir 1 ítem");
    const item: any = res.rows[0];
    assert.equal(Number(item.quantity), 2, "quantity debe ser 2");
    assert.equal(Number(item.count), 2, "count heredado debe ser 2");
    assert.equal(Number(item.unit_price), 32000, "unit_price debe ser 32000");
    assert.equal(Number(item.price), 32000, "price heredado debe ser 32000");
  } finally {
    setTursoClientForTesting(null);
    if (oldDbUrl !== undefined) process.env.TURSO_DATABASE_URL = oldDbUrl; else delete process.env.TURSO_DATABASE_URL;
    if (oldDbToken !== undefined) process.env.TURSO_AUTH_TOKEN = oldDbToken; else delete process.env.TURSO_AUTH_TOKEN;
  }
});

test("Migración Turso: Reintento de createOrder ante fallo transitorio no duplica pedidos ni order_items", async () => {
  const oldDbUrl = process.env.TURSO_DATABASE_URL;
  const oldDbToken = process.env.TURSO_AUTH_TOKEN;
  process.env.TURSO_DATABASE_URL = "libsql://mock-prod-db.turso.io";
  process.env.TURSO_AUTH_TOKEN = "mock-token";

  const realClient = createClient({ url: ":memory:" });

  // Wrapper que falla en el primer batch write de createOrder, pero triunfa en el reintento
  let batchCalls = 0;
  const proxyClient = {
    execute: (stmt: any) => realClient.execute(stmt),
    batch: async (stmts: any[], mode?: string) => {
      batchCalls++;
      // El primer batch en ensureTursoReady es DDL (mode == 'write'). Permitir ese batch.
      // Fallar específicamente en el segundo batch (el primer intento de inserción de orden).
      if (batchCalls === 2) {
        throw new Error("Simulated transient Turso batch failure (first attempt)");
      }
      return realClient.batch(stmts, mode as any);
    },
  };

  setTursoClientForTesting(proxyClient);

  try {
    resetTursoReadyForTesting();
    await ensureTursoReady();

    const order = await createOrder(
      "whatsapp:+573007654321",
      [
        { sku: "C4S", quantity: 1, unitPrice: 18000 },
        { sku: "BEB_CAFE", quantity: 2, unitPrice: 3500 },
      ],
      25000,
      { customerName: "Cliente Sin Duplicados", deliveryAddress: "Calle 10 # 20-30", paymentMethod: "Efectivo" }
    );

    assert.ok(order.id, "El pedido debe crearse satisfactoriamente tras el auto-reintento");
    assert.ok(batchCalls >= 3, `Debe haber intentado al menos 3 batches (inicial, intento fallido y reintento exitoso). Actual: ${batchCalls}`);

    // Verificar en la base de datos real que no hay pedidos duplicados
    const ordersRes = await realClient.execute({
      sql: "SELECT * FROM orders WHERE conversation_id = ?",
      args: ["whatsapp:+573007654321"],
    });
    assert.equal(ordersRes.rows.length, 1, "Debe existir exactamente 1 pedido en la tabla orders (sin duplicación)");

    // Verificar que no hay items duplicados
    const itemsRes = await realClient.execute({
      sql: "SELECT * FROM order_items WHERE order_id = ? ORDER BY sku ASC",
      args: [order.id],
    });
    assert.equal(itemsRes.rows.length, 2, "Debe existir exactamente 2 ítems en la tabla order_items (sin duplicación)");
  } finally {
    setTursoClientForTesting(null);
    if (oldDbUrl !== undefined) process.env.TURSO_DATABASE_URL = oldDbUrl; else delete process.env.TURSO_DATABASE_URL;
    if (oldDbToken !== undefined) process.env.TURSO_AUTH_TOKEN = oldDbToken; else delete process.env.TURSO_AUTH_TOKEN;
  }
});

test("Migración Turso: Regresión SQLITE_MISMATCH — createOrder soporta order_items con id INTEGER PRIMARY KEY AUTOINCREMENT sin fallo de tipo", async () => {
  const oldDbUrl = process.env.TURSO_DATABASE_URL;
  const oldDbToken = process.env.TURSO_AUTH_TOKEN;
  process.env.TURSO_DATABASE_URL = "libsql://mock-prod-db.turso.io";
  process.env.TURSO_AUTH_TOKEN = "mock-token";

  const client = createClient({ url: ":memory:" });
  setTursoClientForTesting(client);

  try {
    // 1. Simular base de datos con el esquema de producción real que disparó el error:
    // id INTEGER PRIMARY KEY AUTOINCREMENT
    await client.execute(`
      CREATE TABLE orders (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        customer_name TEXT,
        delivery_address TEXT,
        payment_method TEXT,
        items_summary TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        total INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    await client.execute(`
      CREATE TABLE order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT NOT NULL,
        sku TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price INTEGER NOT NULL,
        created_at INTEGER DEFAULT 0
      );
    `);

    // 2. Ejecutar ensureTursoReady para que la introspección de columnas detecte id INTEGER
    resetTursoReadyForTesting();
    await ensureTursoReady();

    // 3. Crear el pedido exacto que falló en producción (SKU: CBS, quantity: 1, unitPrice: 36000, total: 36000)
    const order = await createOrder(
      "whatsapp:+573009991122",
      [{ sku: "CBS", quantity: 1, unitPrice: 36000 }],
      36000,
      {
        customerName: "Cliente Producción CBS",
        deliveryAddress: "Carrera 7 # 12-34, Tocancipá",
        paymentMethod: "Nequi",
        itemsSummary: "1x Caja Buñuelos Especiales (CBS)",
      }
    );

    assert.ok(order.id, "El pedido debe crearse satisfactoriamente sin SQLITE_MISMATCH");

    // 4. Verificar en order_items que el ítem se insertó con su ID autoincremental de SQLite
    const res = await client.execute({
      sql: "SELECT * FROM order_items WHERE order_id = ?",
      args: [order.id],
    });

    assert.equal(res.rows.length, 1, "Debe existir exactamente 1 ítem insertado");
    const item: any = res.rows[0];
    assert.equal(typeof item.id === "number" || !isNaN(Number(item.id)), true, "El id debe ser un número entero autoincremental");
    assert.ok(Number(item.id) >= 1, "El id autoincremental debe ser >= 1");
    assert.equal(item.sku, "CBS");
    assert.equal(Number(item.quantity), 1);
    assert.equal(Number(item.unit_price), 36000);

    // 5. Verificar inserción múltiple para confirmar asignación secuencial
    const multiOrder = await createOrder(
      "whatsapp:+573009991122",
      [
        { sku: "CBS", quantity: 2, unitPrice: 36000 },
        { sku: "BEB_CAFE", quantity: 1, unitPrice: 3500 },
      ],
      75500,
      { customerName: "Cliente Múltiple", paymentMethod: "Efectivo" }
    );

    const multiRes = await client.execute({
      sql: "SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC",
      args: [multiOrder.id],
    });

    assert.equal(multiRes.rows.length, 2, "Deben existir 2 ítems insertados");
    const item1: any = multiRes.rows[0];
    const item2: any = multiRes.rows[1];
    assert.ok(Number(item2.id) > Number(item1.id), "Los IDs deben ser crecientes y asignados por SQLite");
  } finally {
    setTursoClientForTesting(null);
    if (oldDbUrl !== undefined) process.env.TURSO_DATABASE_URL = oldDbUrl; else delete process.env.TURSO_DATABASE_URL;
    if (oldDbToken !== undefined) process.env.TURSO_AUTH_TOKEN = oldDbToken; else delete process.env.TURSO_AUTH_TOKEN;
  }
});

test("Migración Turso: Regresión NOT NULL constraint — createOrder soporta order_items con name TEXT NOT NULL y id INTEGER PRIMARY KEY AUTOINCREMENT", async () => {
  const oldDbUrl = process.env.TURSO_DATABASE_URL;
  const oldDbToken = process.env.TURSO_AUTH_TOKEN;
  process.env.TURSO_DATABASE_URL = "libsql://mock-prod-db.turso.io";
  process.env.TURSO_AUTH_TOKEN = "mock-token";

  const client = createClient({ url: ":memory:" });
  setTursoClientForTesting(client);

  try {
    // 1. Simular base de datos con el esquema histórico exacto que provocó:
    // "SQLITE_CONSTRAINT: NOT NULL constraint failed: order_items.name"
    await client.execute(`
      CREATE TABLE orders (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        customer_name TEXT,
        delivery_address TEXT,
        payment_method TEXT,
        items_summary TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        total INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    await client.execute(`
      CREATE TABLE order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT NOT NULL,
        sku TEXT NOT NULL,
        name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price INTEGER NOT NULL,
        created_at INTEGER DEFAULT 0
      );
    `);

    resetTursoReadyForTesting();
    await ensureTursoReady();

    // 2. Crear pedido con SKU CBS sin proveer name explícito en el ítem (debe resolverse del catálogo existente)
    const order = await createOrder(
      "whatsapp:+573005554433",
      [{ sku: "CBS", quantity: 1, unitPrice: 36000 }],
      36000,
      {
        customerName: "Cliente Producción CBS",
        deliveryAddress: "Calle 10 # 5-20",
        paymentMethod: "Nequi",
      }
    );

    assert.ok(order.id, "El pedido debe crearse exitosamente sin error NOT NULL en order_items.name");

    const res = await client.execute({
      sql: "SELECT * FROM order_items WHERE order_id = ?",
      args: [order.id],
    });

    assert.equal(res.rows.length, 1, "Debe existir 1 ítem en order_items");
    const item: any = res.rows[0];
    assert.equal(typeof item.id === "number" || !isNaN(Number(item.id)), true, "El id debe ser autoincrementado");
    assert.ok(Number(item.id) >= 1);
    assert.equal(item.sku, "CBS");
    assert.ok(item.name && item.name.length > 0, "order_items.name no debe ser nulo ni vacío");
    assert.equal(item.name, "CAJA x8 Surtida", "El nombre debe corresponder al catálogo oficial para CBS");
    assert.equal(Number(item.quantity), 1);
    assert.equal(Number(item.unit_price), 36000);

    // 3. Crear pedido con name explícito provisto
    const orderWithCustomName = await createOrder(
      "whatsapp:+573005554433",
      [{ sku: "CBS", name: "Caja Especial Buñuelos Surtidos", quantity: 2, unitPrice: 36000 }],
      72000,
      { customerName: "Cliente Con Nombre", paymentMethod: "Efectivo" }
    );

    const resCustom = await client.execute({
      sql: "SELECT * FROM order_items WHERE order_id = ?",
      args: [orderWithCustomName.id],
    });
    const itemCustom: any = resCustom.rows[0];
    assert.equal(itemCustom.name, "Caja Especial Buñuelos Surtidos", "Debe respetar el nombre provisto");

    // 4. Probar con productos de bebidas y tradicionales del catálogo
    const multiOrder = await createOrder(
      "whatsapp:+573005554433",
      [
        { sku: "C4T", quantity: 1, unitPrice: 16000 },
        { sku: "BEB_CAFE", quantity: 2, unitPrice: 3500 },
      ],
      23000,
      { customerName: "Cliente Café", paymentMethod: "Efectivo" }
    );

    const multiRes = await client.execute({
      sql: "SELECT * FROM order_items WHERE order_id = ? ORDER BY sku ASC",
      args: [multiOrder.id],
    });
    assert.equal(multiRes.rows.length, 2);
    const cafeItem: any = multiRes.rows.find((r: any) => r.sku === "BEB_CAFE");
    const c4tItem: any = multiRes.rows.find((r: any) => r.sku === "C4T");
    assert.equal(cafeItem.name, "Café Campesino");
    assert.equal(c4tItem.name, "CAJA x4 Tradicional");
  } finally {
    setTursoClientForTesting(null);
    if (oldDbUrl !== undefined) process.env.TURSO_DATABASE_URL = oldDbUrl; else delete process.env.TURSO_DATABASE_URL;
    if (oldDbToken !== undefined) process.env.TURSO_AUTH_TOKEN = oldDbToken; else delete process.env.TURSO_AUTH_TOKEN;
  }
});

test("Migración Turso: Blindaje contra columnas NOT NULL adicionales en esquemas históricos", async () => {
  const oldDbUrl = process.env.TURSO_DATABASE_URL;
  const oldDbToken = process.env.TURSO_AUTH_TOKEN;
  process.env.TURSO_DATABASE_URL = "libsql://mock-prod-db.turso.io";
  process.env.TURSO_AUTH_TOKEN = "mock-token";

  const client = createClient({ url: ":memory:" });
  setTursoClientForTesting(client);

  try {
    // Esquema con columnas NOT NULL arbitrarias (subtotal, notes)
    await client.execute(`
      CREATE TABLE orders (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        total INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    await client.execute(`
      CREATE TABLE order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT NOT NULL,
        sku TEXT NOT NULL,
        name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price INTEGER NOT NULL,
        subtotal INTEGER NOT NULL,
        notes TEXT NOT NULL,
        created_at INTEGER DEFAULT 0
      );
    `);

    resetTursoReadyForTesting();
    await ensureTursoReady();

    const order = await createOrder(
      "whatsapp:+573001112233",
      [{ sku: "C8T", quantity: 2, unitPrice: 32000 }],
      64000
    );

    assert.ok(order.id, "El pedido debe crearse sin violar restricciones NOT NULL de columnas adicionales");

    const res = await client.execute({
      sql: "SELECT * FROM order_items WHERE order_id = ?",
      args: [order.id],
    });
    assert.equal(res.rows.length, 1);
    const item: any = res.rows[0];
    assert.equal(Number(item.subtotal), 64000, "El subtotal debe calcularse correctamente");
    assert.equal(typeof item.notes, "string", "notes debe ser una cadena no nula");
  } finally {
    setTursoClientForTesting(null);
    if (oldDbUrl !== undefined) process.env.TURSO_DATABASE_URL = oldDbUrl; else delete process.env.TURSO_DATABASE_URL;
    if (oldDbToken !== undefined) process.env.TURSO_AUTH_TOKEN = oldDbToken; else delete process.env.TURSO_AUTH_TOKEN;
  }
});




