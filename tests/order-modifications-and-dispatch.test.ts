import assert from "node:assert/strict";
import test from "node:test";
import {
  handleSalesMessage,
} from "../lib/agent/sales-agent";
import {
  OFFICIAL_PRICES,
  recalculateOrderTotal,
  shouldInterceptMissingSauces,
  MISSING_SAUCES_INTERCEPT_MESSAGE,
} from "../lib/agent/order-validator";
import {
  notifyDeliveryDriver,
  formatDeliveryDriverMessage,
} from "../lib/delivery-driver";
import {
  createOrder,
  getConversation,
  getOrders,
  updateOrderStatus,
  getOrgSettings,
  updateOrgSettings,
  setTursoClientForTesting,
  type Order,
} from "../lib/store";
import { getSystemLogs } from "../lib/logger";

test("Test A: Cambio de producto de surtida a tradicional («Para cambiar a una tradicional») abandona el bucle de salsas", async () => {
  const convId = "whatsapp:+573001112233";

  // Turno 1: Cliente pide caja surtida
  const res1 = await handleSalesMessage(convId, "Hola, quiero una caja surtida de 8", "Carlos Gómez");
  assert.ok(
    res1.reply.toLowerCase().includes("salsas") || res1.reply.includes("Mora") || res1.reply.includes("Arequipe"),
    "Turno 1 debe preguntar por salsas para caja surtida"
  );

  // Turno 2: Cliente pide cambiar a una tradicional
  const res2 = await handleSalesMessage(convId, "Para cambiar a una tradicional", "Carlos Gómez");

  // Verificaciones de Turno 2:
  // 1. No debe forzar el intercept de salsas
  assert.notEqual(res2.reply, MISSING_SAUCES_INTERCEPT_MESSAGE, "No debe interceptar exigiendo salsas de surtida");
  // 2. No debe insistir en salsas
  assert.ok(
    !res2.reply.toLowerCase().includes("qué salsas prefieres") &&
    !res2.reply.toLowerCase().includes("cuántos buñuelos de cada sabor"),
    "No debe seguir pidiendo salsas para una caja tradicional"
  );
  // 3. Debe reconocer la caja tradicional o avanzar a pedir dirección / bebidas
  assert.ok(
    res2.reply.toLowerCase().includes("tradicional") ||
    res2.reply.toLowerCase().includes("dirección") ||
    res2.reply.toLowerCase().includes("bebida"),
    "Debe reconocer el cambio a tradicional o solicitar dirección"
  );
});

test("Test B: Resumen previo y orden confirmada corresponden a C8T ($32.000 COP) con domicilio gratis ($0)", async () => {
  const convId = "whatsapp:+573004445566";

  // Turno 1: Pide surtida
  await handleSalesMessage(convId, "Quiero una caja de 8 surtida", "Lucía Torres");
  // Turno 2: Cambia a tradicional
  await handleSalesMessage(convId, "Para cambiar a una tradicional", "Lucía Torres");
  // Turno 3: Indica dirección y medio de pago
  const res3 = await handleSalesMessage(
    convId,
    "Mi dirección es Calle 7 # 11-20 conjunto El Portal y pago en efectivo con billete de 50",
    "Lucía Torres"
  );

  // Verificaciones Paso 6 (Resumen Previo):
  assert.ok(
    res3.reply.toLowerCase().includes("resumen") || res3.reply.includes("1️⃣"),
    "Debe presentar el Resumen Previo con opciones 1 y 2"
  );
  assert.ok(
    res3.reply.includes("32.000") || res3.reply.includes("32,000"),
    "El total en resumen debe ser $32.000 COP (Caja x8 Tradicional)"
  );
  assert.ok(
    !res3.reply.includes("36.000") && !res3.reply.includes("34.000"),
    "NO debe cobrar precio de caja surtida ($36.000 o $34.000)"
  );
  assert.ok(
    res3.reply.includes("GRATIS") || res3.reply.includes("$0"),
    "El domicilio debe mostrarse como GRATIS ($0)"
  );
  assert.ok(
    !res3.reply.toLowerCase().includes("mora") && !res3.reply.toLowerCase().includes("arequipe"),
    "El resumen de caja tradicional no debe incluir salsas"
  );

  // Turno 4: Confirmación oficial con 1 (Paso 7)
  const res4 = await handleSalesMessage(convId, "1", "Lucía Torres");

  assert.ok(
    res4.reply.toLowerCase().includes("confirmado") || res4.reply.toLowerCase().includes("registrado"),
    "Debe confirmar el pedido tras recibir 1"
  );

  // Comprobar orden persistida en BD
  const orders = await getOrders();
  const createdOrder = orders.find((o) => o.conversationId === convId);
  assert.ok(createdOrder, "La orden debe existir en la base de datos");
  assert.equal(createdOrder.total, 32000, "El total guardado en BD debe ser exactamente $32.000 COP");
  assert.equal(createdOrder.deliveryFee, 0, "El costo de domicilio guardado debe ser $0");

  const math = recalculateOrderTotal(createdOrder.items || [], OFFICIAL_PRICES);
  assert.equal(math.total, 32000, "El recálculo matemático oficial debe ser $32.000 COP");
  assert.equal(math.deliveryFee, 0, "Tarifa de domicilio recalculada debe ser 0");
});

test("Test C: Confirmación de pedido despacha notificación formateada al domiciliario", async () => {
  await updateOrgSettings({
    deliveryDriverPhone: "3109998877",
    deliveryDriverNotifyEnabled: "true",
  });

  const testOrder: Order = {
    id: "ord-test-dispatch-c",
    conversationId: "whatsapp:+573112223344",
    customerName: "Mariana Rojas",
    customerPhone: "3112223344",
    deliveryAddress: "Carrera 4 # 8-15 Apto 302",
    items: [{ sku: "C8T", quantity: 1, unitPrice: 32000, name: "Caja x8 Tradicional" }],
    itemsSummary: "1x Caja x8 Tradicional",
    total: 32000,
    deliveryFee: 0,
    paymentMethod: "Efectivo contra entrega",
    changeAmount: "Paga con $50.000 (Cambio: $18.000)",
    status: "pending",
    createdAt: Date.now(),
  };

  const formattedMsg = formatDeliveryDriverMessage(testOrder);
  assert.ok(formattedMsg.includes("NUEVO DOMICILIO ASIGNADO"), "Encabezado debe indicar nuevo domicilio asignado");
  assert.ok(formattedMsg.includes("ord-test"), "Debe incluir ID de la orden");
  assert.ok(formattedMsg.includes("Mariana Rojas"), "Debe incluir nombre del cliente");
  assert.ok(formattedMsg.includes("Carrera 4 # 8-15 Apto 302"), "Debe incluir dirección de entrega");
  assert.ok(formattedMsg.includes("32.000"), "Debe incluir el total exacto de $32.000");
  assert.ok(formattedMsg.includes("GRATIS") || formattedMsg.includes("$0"), "Debe especificar domicilio gratis");
  assert.ok(formattedMsg.includes("311 222 3344"), "Debe formatear el teléfono de contacto");
});

test("Test D: Simulación de fallo en Evolution API registra advertencia en logs sin tumbar la orden", async () => {
  await updateOrgSettings({
    deliveryDriverPhone: "3109998877",
    deliveryDriverNotifyEnabled: "true",
  });
  const oldUrl = process.env.EVOLUTION_API_URL;
  const oldKey = process.env.EVOLUTION_API_KEY;
  const oldInst = process.env.EVOLUTION_INSTANCE;

  process.env.EVOLUTION_API_URL = "https://mock-evolution.local";
  process.env.EVOLUTION_API_KEY = "mock_key";
  process.env.EVOLUTION_INSTANCE = "bunuelandia";

  const originalFetch = globalThis.fetch;
  // Simular fallo en fetch de Evolution API
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === "string" ? input : input.toString();
    if (urlStr.includes("/message/sendText")) {
      return new Response(JSON.stringify({ error: "Evolution API timeout", status: 500 }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    return originalFetch(input, init);
  };

  try {
    const failedDispatchOrder: Order = {
      id: "ord-test-fail-d",
      conversationId: "whatsapp:+573155556677",
      customerName: "Andrés Fallo",
      customerPhone: "3155556677",
      deliveryAddress: "Vereda La Fuente Lote 3",
      items: [{ sku: "C8T", quantity: 1, unitPrice: 32000 }],
      itemsSummary: "1x Caja x8 Tradicional",
      total: 32000,
      deliveryFee: 0,
      paymentMethod: "Nequi",
      status: "pending",
      createdAt: Date.now(),
    };

    const res = await notifyDeliveryDriver(failedDispatchOrder);
    // Debe capturar el fallo amablemente
    assert.equal(res.ok, false, "Debe reportar que el envío falló");
    assert.ok(res.error, "Debe contener mensaje descriptivo del error");

    // Verificar que se registró evento en system_logs
    const logs = await getSystemLogs(20);
    const driverLog = logs.find((l) => l.module === "driver" && l.level === "warn");
    assert.ok(driverLog, "Debe haber registrado un log de advertencia para el domiciliario");
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl !== undefined) process.env.EVOLUTION_API_URL = oldUrl; else delete process.env.EVOLUTION_API_URL;
    if (oldKey !== undefined) process.env.EVOLUTION_API_KEY = oldKey; else delete process.env.EVOLUTION_API_KEY;
    if (oldInst !== undefined) process.env.EVOLUTION_INSTANCE = oldInst; else delete process.env.EVOLUTION_INSTANCE;
  }
});

test("Test E: Cancelación («Para cancelar pedido») y reinicio («Hola para un pedido») con contexto limpio", async () => {
  const convId = "whatsapp:+573207778899";

  // Paso 1: Cliente pide caja surtida con sabores
  await handleSalesMessage(convId, "Hola quiero una caja surtida de 8 con mora y arequipe", "Pedro Gómez");

  // Paso 2: Cliente cancela el pedido en curso
  const cancelRes = await handleSalesMessage(convId, "Para cancelar pedido", "Pedro Gómez");
  assert.ok(
    cancelRes.reply.toLowerCase().includes("cancelado") || cancelRes.reply.toLowerCase().includes("cancelada"),
    "Debe confirmar la cancelación del pedido o borrador"
  );

  // Paso 3: Cliente inicia un nuevo pedido independiente
  const newOrderRes = await handleSalesMessage(convId, "Hola para un pedido", "Pedro Gómez");
  assert.ok(
    newOrderRes.reply.toLowerCase().includes("bienvenido") ||
    newOrderRes.reply.toLowerCase().includes("nuevo pedido") ||
    newOrderRes.reply.toLowerCase().includes("cajas"),
    "Debe responder con bienvenida de nuevo pedido limpio"
  );

  // Paso 4: Cliente pide ahora una tradicional
  const tradRes = await handleSalesMessage(convId, "Quiero una caja tradicional de 8", "Pedro Gómez");
  assert.notEqual(
    tradRes.reply,
    MISSING_SAUCES_INTERCEPT_MESSAGE,
    "La nueva orden tradicional no debe interceptar pidiendo salsas"
  );
  assert.ok(
    !tradRes.reply.toLowerCase().includes("qué salsas prefieres") &&
    !tradRes.reply.toLowerCase().includes("cuántos buñuelos de cada sabor"),
    "La nueva orden tradicional debe mantenerse sin salsas"
  );
});

test("Test F: Reintentos o mensajes repetidos no generan notificaciones duplicadas al domiciliario", async () => {
  await updateOrgSettings({
    deliveryDriverPhone: "3109998877",
    deliveryDriverNotifyEnabled: "true",
  });

  const testOrder: Order = {
    id: "ord-test-dedupe-f",
    conversationId: "whatsapp:+573189990011",
    customerName: "Elena Gómez",
    customerPhone: "3189990011",
    deliveryAddress: "Calle 15 # 3-40",
    items: [{ sku: "C8T", quantity: 1, unitPrice: 32000 }],
    itemsSummary: "1x Caja x8 Tradicional",
    total: 32000,
    deliveryFee: 0,
    paymentMethod: "Nequi",
    status: "pending",
    driverNotified: "initial", // Simular que ya fue notificado previamente en BD
    createdAt: Date.now(),
  };

  // Primera invocación con order.driverNotified ya marcado
  const dedupeRes = await notifyDeliveryDriver(testOrder);
  assert.equal(dedupeRes.ok, true, "Debe responder ok");
  assert.equal(dedupeRes.skipped, "duplicate", "Debe saltar el envío por detección de duplicado");

  // Verificar que si se llama de nuevo en memoria para la misma orden también se deduplica
  const testOrder2: Order = {
    ...testOrder,
    id: "ord-test-dedupe-mem-f",
    driverNotified: undefined,
  };

  const oldUrl = process.env.EVOLUTION_API_URL;
  const oldKey = process.env.EVOLUTION_API_KEY;
  const oldInst = process.env.EVOLUTION_INSTANCE;

  process.env.EVOLUTION_API_URL = "https://mock-evolution.local";
  process.env.EVOLUTION_API_KEY = "mock_key";
  process.env.EVOLUTION_INSTANCE = "bunuelandia";

  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === "string" ? input : input.toString();
    if (urlStr.includes("/message/sendText")) {
      fetchCount++;
      return new Response(JSON.stringify({ status: "SUCCESS" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return originalFetch(input, init);
  };

  try {
    const firstCall = await notifyDeliveryDriver(testOrder2);
    assert.equal(firstCall.ok, true);

    const secondCall = await notifyDeliveryDriver(testOrder2);
    assert.equal(secondCall.ok, true);
    assert.equal(secondCall.skipped, "duplicate", "La segunda llamada debe ser omitida por duplicado");
    assert.equal(fetchCount, 1, "Solo se debe haber realizado 1 llamada HTTP a Evolution API");
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl !== undefined) process.env.EVOLUTION_API_URL = oldUrl; else delete process.env.EVOLUTION_API_URL;
    if (oldKey !== undefined) process.env.EVOLUTION_API_KEY = oldKey; else delete process.env.EVOLUTION_API_KEY;
    if (oldInst !== undefined) process.env.EVOLUTION_INSTANCE = oldInst; else delete process.env.EVOLUTION_INSTANCE;
  }
});

test("Test G: Invocaciones simultáneas concurrentes (Promise.all) despachan exactamente 1 notificación", async () => {
  await updateOrgSettings({
    deliveryDriverPhone: "3109998877",
    deliveryDriverNotifyEnabled: "true",
  });

  const testOrderConcurrent: Order = {
    id: "ord-test-concurrent-g",
    conversationId: "whatsapp:+573171112233",
    customerName: "Mateo Concurrente",
    customerPhone: "3171112233",
    deliveryAddress: "Calle 100 # 15-20",
    items: [{ sku: "C8T", quantity: 1, unitPrice: 32000 }],
    itemsSummary: "1x Caja x8 Tradicional",
    total: 32000,
    deliveryFee: 0,
    paymentMethod: "Nequi",
    status: "pending",
    createdAt: Date.now(),
  };

  const oldUrl = process.env.EVOLUTION_API_URL;
  const oldKey = process.env.EVOLUTION_API_KEY;
  const oldInst = process.env.EVOLUTION_INSTANCE;

  process.env.EVOLUTION_API_URL = "https://mock-evolution.local";
  process.env.EVOLUTION_API_KEY = "mock_key";
  process.env.EVOLUTION_INSTANCE = "bunuelandia";

  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === "string" ? input : input.toString();
    if (urlStr.includes("/message/sendText")) {
      fetchCount++;
      // Retardo para forzar concurrencia activa
      await new Promise((r) => setTimeout(r, 40));
      return new Response(JSON.stringify({ status: "SUCCESS" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return originalFetch(input, init);
  };

  try {
    const [res1, res2] = await Promise.all([
      notifyDeliveryDriver(testOrderConcurrent),
      notifyDeliveryDriver(testOrderConcurrent),
    ]);

    assert.equal(res1.ok, true);
    assert.equal(res2.ok, true);
    const sentCount = (res1.skipped ? 0 : 1) + (res2.skipped ? 0 : 1);
    const skippedCount = (res1.skipped === "duplicate" ? 1 : 0) + (res2.skipped === "duplicate" ? 1 : 0);
    assert.equal(sentCount, 1, "Solo 1 invocación debe realizar el envío real");
    assert.equal(skippedCount, 1, "La otra invocación concurrente debe ser omitida por duplicado");
    assert.equal(fetchCount, 1, "Solo debe haber 1 llamada HTTP a Evolution API");
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl !== undefined) process.env.EVOLUTION_API_URL = oldUrl; else delete process.env.EVOLUTION_API_URL;
    if (oldKey !== undefined) process.env.EVOLUTION_API_KEY = oldKey; else delete process.env.EVOLUTION_API_KEY;
    if (oldInst !== undefined) process.env.EVOLUTION_INSTANCE = oldInst; else delete process.env.EVOLUTION_INSTANCE;
  }
});

test("Test H: Fallo de persistencia en createOrder activa Fail-Closed sin confirmación falsa al cliente", async () => {
  const convId = "whatsapp:+573198887766";

  // Preparar borrador previo
  await handleSalesMessage(convId, "Quiero una caja tradicional de 8", "Sebastián Fail");
  await handleSalesMessage(convId, "Carrera 7 # 45-10 apto 201 y pago en efectivo con 50", "Sebastián Fail");

  const oldDbUrl = process.env.TURSO_DATABASE_URL;
  const oldDbToken = process.env.TURSO_AUTH_TOKEN;
  process.env.TURSO_DATABASE_URL = "libsql://mock-test-db.turso.io";
  process.env.TURSO_AUTH_TOKEN = "mock-token";

  // Simular que Turso falla al insertar
  setTursoClientForTesting({
    batch: async () => {
      throw new Error("Simulated Turso database connection failure");
    },
    execute: async () => {
      throw new Error("Simulated Turso database connection failure");
    },
  });

  try {
    // El cliente responde "1" para confirmar
    const confirmRes = await handleSalesMessage(convId, "1", "Sebastián Fail");

    // Debe operar en modo Fail-Closed
    assert.ok(
      !confirmRes.reply.toLowerCase().includes("pedido confirmado") &&
      !confirmRes.reply.toLowerCase().includes("registrado en buñuelandia"),
      "NO debe enviar confirmación de éxito si la persistencia falló"
    );
    assert.ok(
      confirmRes.reply.includes("inconveniente técnico") || confirmRes.reply.includes("intentar"),
      "Debe responder con mensaje de recuperación técnica segura"
    );

    // Comprobar que no quedó orden huérfana en la lista
    const orders = await getOrders();
    const orphan = orders.find((o) => o.conversationId === convId && o.customerName === "Sebastián Fail");
    assert.equal(orphan, undefined, "No debe existir ninguna orden huérfana en el sistema");
  } finally {
    setTursoClientForTesting(null);
    if (oldDbUrl !== undefined) process.env.TURSO_DATABASE_URL = oldDbUrl; else delete process.env.TURSO_DATABASE_URL;
    if (oldDbToken !== undefined) process.env.TURSO_AUTH_TOKEN = oldDbToken; else delete process.env.TURSO_AUTH_TOKEN;
  }
});

test("Test I: Reintento de notificación al domiciliario tras fallo previo recupera estado y envía exitosamente", async () => {
  await updateOrgSettings({
    deliveryDriverPhone: "3109998877",
    deliveryDriverNotifyEnabled: "true",
  });

  const testOrderRetry: Order = {
    id: "ord-test-retry-i",
    conversationId: "whatsapp:+573164445566",
    customerName: "Laura Reintento",
    customerPhone: "3164445566",
    deliveryAddress: "Diagonal 45 # 12-30",
    items: [{ sku: "C8T", quantity: 1, unitPrice: 32000 }],
    itemsSummary: "1x Caja x8 Tradicional",
    total: 32000,
    deliveryFee: 0,
    paymentMethod: "Nequi",
    status: "pending",
    createdAt: Date.now(),
  };

  const oldUrl = process.env.EVOLUTION_API_URL;
  const oldKey = process.env.EVOLUTION_API_KEY;
  const oldInst = process.env.EVOLUTION_INSTANCE;

  process.env.EVOLUTION_API_URL = "https://mock-evolution.local";
  process.env.EVOLUTION_API_KEY = "mock_key";
  process.env.EVOLUTION_INSTANCE = "bunuelandia";

  const originalFetch = globalThis.fetch;
  let attemptCount = 0;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === "string" ? input : input.toString();
    if (urlStr.includes("/message/sendText")) {
      attemptCount++;
      if (attemptCount === 1) {
        // Primer intento: simular fallo temporal de Evolution API
        return new Response(JSON.stringify({ error: "Network timeout", status: 504 }), {
          status: 504,
          headers: { "Content-Type": "application/json" },
        });
      }
      // Segundo intento: servicio recuperado
      return new Response(JSON.stringify({ status: "SUCCESS" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return originalFetch(input, init);
  };

  try {
    // 1. Primer intento falla
    const firstRes = await notifyDeliveryDriver(testOrderRetry);
    assert.equal(firstRes.ok, false, "El primer intento debe reportar fallo");

    // 2. Reintento debe permitir enviar porque el reclamo fue revertido tras el fallo
    const secondRes = await notifyDeliveryDriver(testOrderRetry);
    assert.equal(secondRes.ok, true, "El reintento debe completarse exitosamente");
    assert.equal(secondRes.skipped, undefined, "El reintento no debe ser omitido como duplicado");
    assert.equal(attemptCount, 2, "Deben haberse realizado 2 llamadas HTTP a Evolution API");

    // 3. Un tercer intento ya completado sí debe deduplicarse
    const thirdRes = await notifyDeliveryDriver(testOrderRetry);
    assert.equal(thirdRes.ok, true);
    assert.equal(thirdRes.skipped, "duplicate", "La tercera llamada sí debe ser deduplicada");
    assert.equal(attemptCount, 2, "No debe realizarse una tercera llamada HTTP");
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl !== undefined) process.env.EVOLUTION_API_URL = oldUrl; else delete process.env.EVOLUTION_API_URL;
    if (oldKey !== undefined) process.env.EVOLUTION_API_KEY = oldKey; else delete process.env.EVOLUTION_API_KEY;
    if (oldInst !== undefined) process.env.EVOLUTION_INSTANCE = oldInst; else delete process.env.EVOLUTION_INSTANCE;
  }
});

test("Test J: Atomicidad de createOrder: si falla la inserción, no queda orden huérfana guardada", async () => {
  const oldDbUrl = process.env.TURSO_DATABASE_URL;
  const oldDbToken = process.env.TURSO_AUTH_TOKEN;
  process.env.TURSO_DATABASE_URL = "libsql://mock-test-db.turso.io";
  process.env.TURSO_AUTH_TOKEN = "mock-token";

  setTursoClientForTesting({
    batch: async () => {
      throw new Error("Simulated Turso batch write failure");
    },
    execute: async () => {
      return { rows: [], rowsAffected: 0 };
    },
  });

  try {
    let threw = false;
    try {
      await createOrder("whatsapp:+573009998877", [{ sku: "C8T", quantity: 1, unitPrice: 32000 }], 32000, {
        customerName: "Cliente Atómico",
      });
    } catch {
      threw = true;
    }
    assert.equal(threw, true, "createOrder debe lanzar excepción si el batch falla");

    // Comprobar que en memoria tampoco quedó guardada
    const orders = await getOrders();
    const orphan = orders.find((o) => o.customerName === "Cliente Atómico");
    assert.equal(orphan, undefined, "No debe existir ninguna orden huérfana en memoria");
  } finally {
    setTursoClientForTesting(null);
    if (oldDbUrl !== undefined) process.env.TURSO_DATABASE_URL = oldDbUrl; else delete process.env.TURSO_DATABASE_URL;
    if (oldDbToken !== undefined) process.env.TURSO_AUTH_TOKEN = oldDbToken; else delete process.env.TURSO_AUTH_TOKEN;
  }
});

test("Test K: Reclamo zombi/stale por caída inesperada de instancia no bloquea permanentemente el despacho", async () => {
  await updateOrgSettings({
    deliveryDriverPhone: "3109998877",
    deliveryDriverNotifyEnabled: "true",
  });

  const staleTime = Date.now() - 3 * 60 * 1000; // Simular caída de instancia hace 3 minutos
  const testOrderStale: Order = {
    id: "ord-test-stale-k",
    conversationId: "whatsapp:+573179998811",
    customerName: "Camila Stale",
    customerPhone: "3179998811",
    deliveryAddress: "Carrera 10 # 20-30",
    items: [{ sku: "C8T", quantity: 1, unitPrice: 32000 }],
    itemsSummary: "1x Caja x8 Tradicional",
    total: 32000,
    deliveryFee: 0,
    paymentMethod: "Nequi",
    status: "pending",
    driverNotified: "sending_initial",
    driverNotifiedAt: staleTime,
    createdAt: staleTime,
  };

  const oldUrl = process.env.EVOLUTION_API_URL;
  const oldKey = process.env.EVOLUTION_API_KEY;
  const oldInst = process.env.EVOLUTION_INSTANCE;

  process.env.EVOLUTION_API_URL = "https://mock-evolution.local";
  process.env.EVOLUTION_API_KEY = "mock_key";
  process.env.EVOLUTION_INSTANCE = "bunuelandia";

  const originalFetch = globalThis.fetch;
  let sent = false;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === "string" ? input : input.toString();
    if (urlStr.includes("/message/sendText")) {
      sent = true;
      return new Response(JSON.stringify({ status: "SUCCESS" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return originalFetch(input, init);
  };

  try {
    const res = await notifyDeliveryDriver(testOrderStale);
    assert.equal(res.ok, true, "Debe reclamar exitosamente el despacho al haber expirado el TTL stale");
    assert.equal(res.skipped, undefined, "No debe saltar como duplicado porque el reclamo anterior expiró");
    assert.equal(sent, true, "Debe enviar el mensaje al domiciliario");
    assert.equal(testOrderStale.driverNotified, "initial", "El estado final debe quedar confirmado como initial");
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl !== undefined) process.env.EVOLUTION_API_URL = oldUrl; else delete process.env.EVOLUTION_API_URL;
    if (oldKey !== undefined) process.env.EVOLUTION_API_KEY = oldKey; else delete process.env.EVOLUTION_API_KEY;
    if (oldInst !== undefined) process.env.EVOLUTION_INSTANCE = oldInst; else delete process.env.EVOLUTION_INSTANCE;
  }
});

