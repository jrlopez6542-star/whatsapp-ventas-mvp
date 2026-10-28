import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { createClient } from "@libsql/client";
import { createUser, createSession } from "../lib/auth/session";
import { getOrders, getMemoryStore } from "../lib/store";
import {
  setTursoClientForTesting,
  resetTursoReadyForTesting,
  ensureTursoReady,
} from "../lib/store/db";
import {
  POST,
  GET,
  CONTROLLED_TEST_CONVERSATION_ID,
  CONTROLLED_TEST_CUSTOMER_NAME,
} from "../app/api/test-order/route";

test("POST /api/test-order: 1. Rechazado fuera de entorno Preview (VERCEL_ENV !== 'preview')", async () => {
  const origVercelEnv = process.env.VERCEL_ENV;
  try {
    delete process.env.VERCEL_ENV;
    const req = new NextRequest("http://localhost/api/test-order", { method: "POST" });
    const res = await POST(req);
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.match(body.error, /solo está permitida en entorno Preview/i);

    // Con VERCEL_ENV=production también debe rechazar
    process.env.VERCEL_ENV = "production";
    const resProd = await POST(req);
    assert.equal(resProd.status, 403);
  } finally {
    process.env.VERCEL_ENV = origVercelEnv;
  }
});

test("POST /api/test-order: 2. Rechazado sin sesión administrativa", async () => {
  const origVercelEnv = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = "preview";

    // 2.1 Sin cookie
    const reqSinCookie = new NextRequest("http://localhost/api/test-order", { method: "POST" });
    const resSinCookie = await POST(reqSinCookie);
    assert.equal(resSinCookie.status, 401);

    // 2.2 Con rol no-admin (ej. operator)
    const operatorUser = await createUser({
      email: `operator_${Date.now()}@bunuelandia.co`,
      password: "Password123*",
      name: "Operador Test",
      role: "operator",
    });
    const { token: operatorToken } = await createSession(operatorUser.id);
    const reqOperator = new NextRequest("http://localhost/api/test-order", {
      method: "POST",
      headers: { cookie: `panel_session=${operatorToken}` },
    });
    const resOperator = await POST(reqOperator);
    assert.equal(resOperator.status, 401);
    const bodyOperator = await resOperator.json();
    assert.match(bodyOperator.error, /permisos insuficientes|no autorizado/i);
  } finally {
    process.env.VERCEL_ENV = origVercelEnv;
  }
});

test("POST /api/test-order: 3. Rechazado si falta configuración segura de Turso o apunta a producción", async () => {
  const origVercelEnv = process.env.VERCEL_ENV;
  const origTursoEnv = process.env.TURSO_ENVIRONMENT;
  const origPreviewUrl = process.env.TURSO_DATABASE_URL_PREVIEW;
  const origPreviewToken = process.env.TURSO_AUTH_TOKEN_PREVIEW;
  const origProdUrl = process.env.TURSO_DATABASE_URL;

  try {
    process.env.VERCEL_ENV = "preview";

    const adminUser = await createUser({
      email: `admin_db_${Date.now()}@bunuelandia.co`,
      password: "Password123*",
      name: "Admin DB Test",
      role: "admin",
    });
    const { token: adminToken } = await createSession(adminUser.id);
    const req = new NextRequest("http://localhost/api/test-order", {
      method: "POST",
      headers: { cookie: `panel_session=${adminToken}` },
    });

    // 3.1 Faltan variables dedicadas de Sandbox
    delete process.env.TURSO_DATABASE_URL_PREVIEW;
    delete process.env.TURSO_AUTH_TOKEN_PREVIEW;
    delete process.env.TURSO_ENVIRONMENT;

    const resFaltan = await POST(req);
    assert.equal(resFaltan.status, 403);
    const bodyFaltan = await resFaltan.json();
    assert.equal(bodyFaltan.ok, false);
    assert.match(bodyFaltan.error, /faltan variables dedicadas de Sandbox/i);

    // 3.2 URL contiene indicadores de producción
    process.env.TURSO_DATABASE_URL_PREVIEW = "libsql://bunuelandia-prod.turso.io";
    process.env.TURSO_AUTH_TOKEN_PREVIEW = "sandbox-token";
    process.env.TURSO_ENVIRONMENT = "preview";

    const resProd = await POST(req);
    assert.equal(resProd.status, 403);
    const bodyProd = await resProd.json();
    assert.match(bodyProd.error, /indicadores de producción/i);

    // 3.3 URL de Preview coincide con la URL de producción configurada
    process.env.TURSO_DATABASE_URL = "libsql://my-company-internal-db.turso.io";
    process.env.TURSO_DATABASE_URL_PREVIEW = "libsql://my-company-internal-db.turso.io";
    const resSame = await POST(req);
    assert.equal(resSame.status, 403);
    const bodySame = await resSame.json();
    assert.match(bodySame.error, /coincide con la URL de producción/i);
  } finally {
    process.env.VERCEL_ENV = origVercelEnv;
    process.env.TURSO_ENVIRONMENT = origTursoEnv;
    process.env.TURSO_DATABASE_URL_PREVIEW = origPreviewUrl;
    process.env.TURSO_AUTH_TOKEN_PREVIEW = origPreviewToken;
    process.env.TURSO_DATABASE_URL = origProdUrl;
  }
});

test("POST /api/test-order: 4, 5 y 6. Creación persistente, no duplicación y respuesta limpia sin secretos", async () => {
  const origVercelEnv = process.env.VERCEL_ENV;
  const origTursoEnv = process.env.TURSO_ENVIRONMENT;
  const origPreviewUrl = process.env.TURSO_DATABASE_URL_PREVIEW;
  const origPreviewToken = process.env.TURSO_AUTH_TOKEN_PREVIEW;
  const origProdUrl = process.env.TURSO_DATABASE_URL;

  const mockDb = createClient({ url: ":memory:" });
  setTursoClientForTesting(mockDb);

  try {
    process.env.VERCEL_ENV = "preview";
    process.env.TURSO_ENVIRONMENT = "preview";
    process.env.TURSO_DATABASE_URL_PREVIEW = "libsql://bunuelandia-sandbox.turso.io";
    process.env.TURSO_AUTH_TOKEN_PREVIEW = "sandbox-token-xyz";
    process.env.TURSO_DATABASE_URL = "libsql://bunuelandia-production.turso.io";

    resetTursoReadyForTesting();
    await ensureTursoReady();

    const memStore = getMemoryStore();
    memStore.orders.clear();

    const adminUser = await createUser({
      email: `admin_success_${Date.now()}@bunuelandia.co`,
      password: "Password123*",
      name: "Admin Success Test",
      role: "admin",
    });
    const { token: adminToken } = await createSession(adminUser.id);
    const req = new NextRequest("http://localhost/api/test-order", {
      method: "POST",
      headers: { cookie: `panel_session=${adminToken}` },
    });

    // 4. Primera ejecución: crea el pedido
    const res1 = await POST(req);
    assert.equal(res1.status, 201);
    const body1 = await res1.json();

    assert.equal(body1.ok, true);
    assert.equal(body1.persisted, true);
    assert.equal(body1.created, true);
    assert.ok(body1.orderId);
    assert.equal(body1.order.customerName, CONTROLLED_TEST_CUSTOMER_NAME);
    assert.equal(body1.order.total, 18000);
    assert.equal(body1.order.status, "pending");

    // 6. Verificación de seguridad en respuesta: No debe contener secretos ni tokens
    const jsonStr = JSON.stringify(body1);
    assert.doesNotMatch(jsonStr, /sandbox-token-xyz/);
    assert.doesNotMatch(jsonStr, /Password123/);
    assert.doesNotMatch(jsonStr, /secret|tokenHash|passwordHash/i);

    // 4b. Verificar persistencia mediante lectura independiente con getOrders()
    const ordersAfterFirst = await getOrders();
    const persistedOrder = ordersAfterFirst.find((o) => o.id === body1.orderId);
    assert.ok(persistedOrder, "El pedido creado debe estar presente en getOrders()");
    assert.equal(persistedOrder.conversationId, CONTROLLED_TEST_CONVERSATION_ID);
    assert.equal(persistedOrder.customerName, CONTROLLED_TEST_CUSTOMER_NAME);

    // 5. Segunda ejecución: no crea duplicados, retorna el existente
    const res2 = await POST(req);
    assert.equal(res2.status, 200);
    const body2 = await res2.json();

    assert.equal(body2.ok, true);
    assert.equal(body2.persisted, true);
    assert.equal(body2.created, false);
    assert.equal(body2.orderId, body1.orderId, "Debe reutilizar el orderId existente");

    const ordersAfterSecond = await getOrders();
    const matchingCount = ordersAfterSecond.filter(
      (o) => o.conversationId === CONTROLLED_TEST_CONVERSATION_ID
    ).length;
    assert.equal(matchingCount, 1, "No debe haber duplicados del pedido de prueba");
  } finally {
    setTursoClientForTesting(null);
    process.env.VERCEL_ENV = origVercelEnv;
    process.env.TURSO_ENVIRONMENT = origTursoEnv;
    process.env.TURSO_DATABASE_URL_PREVIEW = origPreviewUrl;
    process.env.TURSO_AUTH_TOKEN_PREVIEW = origPreviewToken;
    process.env.TURSO_DATABASE_URL = origProdUrl;
  }
});

test("GET /api/test-order: 7. Mantiene comportamiento existente (limpieza inmediata tras prueba)", async () => {
  const origNodeEnv = process.env.NODE_ENV;
  const mockDb = createClient({ url: ":memory:" });
  setTursoClientForTesting(mockDb);

  try {
    (process.env as Record<string, string | undefined>).NODE_ENV = "development";
    resetTursoReadyForTesting();
    await ensureTursoReady();

    const req = new NextRequest("http://localhost/api/test-order", { method: "GET" });
    const res = await GET(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.match(body.msg, /completada y limpiada/i);

    // En getOrders no debe quedar guardado porque GET lo elimina de inmediato
    const orders = await getOrders();
    assert.equal(orders.some((o) => o.id === body.orderId), false);
  } finally {
    setTursoClientForTesting(null);
    (process.env as Record<string, string | undefined>).NODE_ENV = origNodeEnv;
  }
});

test("POST /api/test-order: 8. Falla de forma segura y aborta sin crear pedido si getOrders() falla (anti-duplicación)", async () => {
  const origVercelEnv = process.env.VERCEL_ENV;
  const origTursoEnv = process.env.TURSO_ENVIRONMENT;
  const origPreviewUrl = process.env.TURSO_DATABASE_URL_PREVIEW;
  const origPreviewToken = process.env.TURSO_AUTH_TOKEN_PREVIEW;

  const realMemoryDb = createClient({ url: ":memory:" });
  setTursoClientForTesting(realMemoryDb);

  try {
    process.env.VERCEL_ENV = "preview";
    process.env.TURSO_ENVIRONMENT = "preview";
    process.env.TURSO_DATABASE_URL_PREVIEW = "libsql://bunuelandia-sandbox.turso.io";
    process.env.TURSO_AUTH_TOKEN_PREVIEW = "sandbox-token-xyz";

    resetTursoReadyForTesting();
    await ensureTursoReady();

    const adminUser = await createUser({
      email: `admin_fail_${Date.now()}@bunuelandia.co`,
      password: "Password123*",
      name: "Admin Fail Test",
      role: "admin",
    });
    const { token: adminToken } = await createSession(adminUser.id);
    const req = new NextRequest("http://localhost/api/test-order", {
      method: "POST",
      headers: { cookie: `panel_session=${adminToken}` },
    });

    // Ahora interceptamos para que falle específicamente la lectura de orders
    const failingDb = {
      execute: async (stmt: unknown) => {
        const sql = typeof stmt === "string" ? stmt : (stmt as { sql?: string })?.sql || "";
        if (sql.includes("FROM orders")) {
          throw new Error("Synthetic database read failure");
        }
        return realMemoryDb.execute(stmt as any);
      },
      batch: async (stmts: any) => realMemoryDb.batch(stmts),
    };
    setTursoClientForTesting(failingDb as unknown as ReturnType<typeof createClient>);

    const res = await POST(req);
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.match(body.error, /No se pudo comprobar la existencia previa del pedido de prueba/i);
    assert.match(body.error, /Synthetic database read failure/);
    assert.match(body.error, /Operación abortada por seguridad/i);
  } finally {
    setTursoClientForTesting(null);
    process.env.VERCEL_ENV = origVercelEnv;
    process.env.TURSO_ENVIRONMENT = origTursoEnv;
    process.env.TURSO_DATABASE_URL_PREVIEW = origPreviewUrl;
    process.env.TURSO_AUTH_TOKEN_PREVIEW = origPreviewToken;
  }
});
