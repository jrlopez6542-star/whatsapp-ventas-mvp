import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET, POST, PREVIEW_TEST_DUMMY_PHONE, PREVIEW_TEST_CONVERSATION_ID } from "../app/api/panel/preview-order-test/route";
import { createUser, createSession } from "../lib/auth/session";
import { getOrders, deleteOrder } from "../lib/store";

test("Fail-Closed: responde 404 si ENABLE_PREVIEW_ORDER_TEST no está habilitada", async () => {
  const origEnv = process.env.ENABLE_PREVIEW_ORDER_TEST;
  const origVercel = process.env.VERCEL_ENV;
  try {
    process.env.ENABLE_PREVIEW_ORDER_TEST = "false";
    process.env.VERCEL_ENV = "preview";

    const res = await GET(new NextRequest("http://localhost/api/panel/preview-order-test"));
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.match(String(body.error), /No disponible/i);
  } finally {
    process.env.ENABLE_PREVIEW_ORDER_TEST = origEnv;
    process.env.VERCEL_ENV = origVercel;
  }
});

test("Fail-Closed: responde 404 en producción aunque la bandera esté activa", async () => {
  const origEnv = process.env.ENABLE_PREVIEW_ORDER_TEST;
  const origVercel = process.env.VERCEL_ENV;
  try {
    process.env.ENABLE_PREVIEW_ORDER_TEST = "true";
    process.env.VERCEL_ENV = "production";

    const res = await POST(new NextRequest("http://localhost/api/panel/preview-order-test", { method: "POST" }));
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.match(String(body.error), /No disponible/i);
  } finally {
    process.env.ENABLE_PREVIEW_ORDER_TEST = origEnv;
    process.env.VERCEL_ENV = origVercel;
  }
});

test("Seguridad: responde 401 si no hay sesión autenticada", async () => {
  const origEnv = process.env.ENABLE_PREVIEW_ORDER_TEST;
  const origVercel = process.env.VERCEL_ENV;
  try {
    process.env.ENABLE_PREVIEW_ORDER_TEST = "true";
    process.env.VERCEL_ENV = "preview";

    const res = await GET(new NextRequest("http://localhost/api/panel/preview-order-test"));
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.match(String(body.error), /No autorizado/i);
  } finally {
    process.env.ENABLE_PREVIEW_ORDER_TEST = origEnv;
    process.env.VERCEL_ENV = origVercel;
  }
});

test("Seguridad: responde 403 si el usuario tiene rol operator (no admin)", async () => {
  const origEnv = process.env.ENABLE_PREVIEW_ORDER_TEST;
  const origVercel = process.env.VERCEL_ENV;
  try {
    process.env.ENABLE_PREVIEW_ORDER_TEST = "true";
    process.env.VERCEL_ENV = "preview";

    const operatorUser = await createUser({
      email: `op_order_${Date.now()}@bunuelandia.co`,
      password: "Password123*",
      name: "Operador Test",
      role: "operator",
      phone: "3001234567",
    });
    const opSession = await createSession(operatorUser.id);

    const req = new NextRequest("http://localhost/api/panel/preview-order-test", {
      headers: { cookie: `panel_session=${opSession.token}` },
    });
    const res = await GET(req);
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.match(String(body.error), /Acceso denegado/i);
  } finally {
    process.env.ENABLE_PREVIEW_ORDER_TEST = origEnv;
    process.env.VERCEL_ENV = origVercel;
  }
});

test("Validación de Payload: rechaza campos no permitidos o intentos de sobrescribir teléfono", async () => {
  const origEnv = process.env.ENABLE_PREVIEW_ORDER_TEST;
  const origVercel = process.env.VERCEL_ENV;
  try {
    process.env.ENABLE_PREVIEW_ORDER_TEST = "true";
    process.env.VERCEL_ENV = "preview";

    const adminUser = await createUser({
      email: `admin_payload_${Date.now()}@bunuelandia.co`,
      password: "Password123*",
      name: "Admin Payload",
      role: "admin",
      phone: "3007654321",
    });
    const adminSession = await createSession(adminUser.id);

    // Intento 1: Enviar customerPhone en el body
    const req1 = new NextRequest("http://localhost/api/panel/preview-order-test", {
      method: "POST",
      headers: {
        cookie: `panel_session=${adminSession.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        customerPhone: "3109999999",
      }),
    });
    const res1 = await POST(req1);
    assert.equal(res1.status, 400);
    const body1 = await res1.json();
    assert.equal(body1.ok, false);
    assert.match(String(body1.error), /Campo no permitido/i);
    assert.match(String(body1.error), /customerPhone/i);

    // Intento 2: Enviar phone o campos arbitrarios como total o dbUrl
    const req2 = new NextRequest("http://localhost/api/panel/preview-order-test", {
      method: "POST",
      headers: {
        cookie: `panel_session=${adminSession.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dbUrl: "libsql://otro-host",
      }),
    });
    const res2 = await POST(req2);
    assert.equal(res2.status, 400);
    const body2 = await res2.json();
    assert.equal(body2.ok, false);
    assert.match(String(body2.error), /Campo no permitido/i);
  } finally {
    process.env.ENABLE_PREVIEW_ORDER_TEST = origEnv;
    process.env.VERCEL_ENV = origVercel;
  }
});

test("Flujo Exitoso e Idempotencia: crea pedido persistente e inmutable sin duplicados ante reintentos", async () => {
  const origEnv = process.env.ENABLE_PREVIEW_ORDER_TEST;
  const origVercel = process.env.VERCEL_ENV;
  try {
    process.env.ENABLE_PREVIEW_ORDER_TEST = "true";
    process.env.VERCEL_ENV = "preview";

    // Limpieza inicial por si existiera residuo en memoria de pruebas anteriores
    const initialOrders = await getOrders();
    const prev = initialOrders.find((o) => o.conversationId === PREVIEW_TEST_CONVERSATION_ID);
    if (prev) {
      await deleteOrder(prev.id).catch(() => {});
    }

    const adminUser = await createUser({
      email: `admin_idem_${Date.now()}@bunuelandia.co`,
      password: "Password123*",
      name: "Admin Idempotencia",
      role: "admin",
      phone: "3007654322",
    });
    const adminSession = await createSession(adminUser.id);

    // 1. Primera invocación: creación inicial exitosa
    const req1 = new NextRequest("http://localhost/api/panel/preview-order-test", {
      method: "POST",
      headers: {
        cookie: `panel_session=${adminSession.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sku: "C4S",
        customerName: "CLIENTE PRUEBA BOTW",
        deliveryAddress: "DIRECCIÓN FICTICIA DE PRUEBA",
        deliveryNotes: "PEDIDO DE PRUEBA — NO DESPACHAR",
      }),
    });

    const res1 = await POST(req1);
    assert.equal(res1.status, 200);
    const body1 = await res1.json();
    assert.equal(body1.ok, true);
    assert.equal(body1.alreadyExists, false);
    assert.ok(body1.orderId, "Debe retornar un orderId generado");
    assert.equal(body1.order.customerPhone, PREVIEW_TEST_DUMMY_PHONE, "El teléfono debe ser inmutablemente 3000000000");
    assert.equal(body1.order.customerName, "CLIENTE PRUEBA BOTW");
    assert.equal(body1.order.deliveryAddress, "DIRECCIÓN FICTICIA DE PRUEBA");
    assert.equal(body1.order.deliveryNotes, "PEDIDO DE PRUEBA — NO DESPACHAR");
    assert.equal(body1.order.paymentMethod, "Efectivo");
    assert.equal(body1.order.status, "pending");
    assert.ok(body1.order.total > 0, "El total debe ser positivo calculado contra el catálogo oficial");

    // Verificar que existe en getOrders()
    const ordersAfterFirst = await getOrders();
    const found1 = ordersAfterFirst.find((o) => o.id === body1.orderId);
    assert.ok(found1, "El pedido ficticio debe estar persistido en el almacén de datos");
    const countAfterFirst = ordersAfterFirst.length;

    // 2. Segunda invocación (reintento o click repetido): debe ser IDEMPOTENTE
    const req2 = new NextRequest("http://localhost/api/panel/preview-order-test", {
      method: "POST",
      headers: {
        cookie: `panel_session=${adminSession.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sku: "C4S",
        customerName: "OTRO NOMBRE QUE NO DEBE SOBRESCRIBIR",
      }),
    });

    const res2 = await POST(req2);
    assert.equal(res2.status, 200);
    const body2 = await res2.json();
    assert.equal(body2.ok, true);
    assert.equal(body2.alreadyExists, true, "Debe indicar que el pedido ya existía");
    assert.equal(body2.orderId, body1.orderId, "Debe retornar el mismo orderId sin crear uno nuevo");
    assert.equal(body2.order.customerName, "CLIENTE PRUEBA BOTW", "No debe mutar los datos del pedido ya creado");

    // 3. Tercera invocación vía GET directo (navegación del administrador): también idempotente
    const req3 = new NextRequest("http://localhost/api/panel/preview-order-test", {
      method: "GET",
      headers: { cookie: `panel_session=${adminSession.token}` },
    });
    const res3 = await GET(req3);
    assert.equal(res3.status, 200);
    const body3 = await res3.json();
    assert.equal(body3.ok, true);
    assert.equal(body3.alreadyExists, true);
    assert.equal(body3.orderId, body1.orderId);

    // Verificar que el conteo de pedidos en el almacén NO aumentó
    const ordersAfterThird = await getOrders();
    assert.equal(ordersAfterThird.length, countAfterFirst, "No deben crearse pedidos duplicados ante solicitudes repetidas");
  } finally {
    process.env.ENABLE_PREVIEW_ORDER_TEST = origEnv;
    process.env.VERCEL_ENV = origVercel;
  }
});
