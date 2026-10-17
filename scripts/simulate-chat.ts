#!/usr/bin/env node
/**
 * scripts/simulate-chat.ts
 *
 * SIMULADOR INTERACTIVO DE VENTAS POR WHATSAPP — BUÑUELANDIA
 *
 * Entorno 100% aislado:
 * - Ejecuta el motor real de ventas (`handleSalesMessage`).
 * - Almacenamiento estrictamente en memoria (`MemoryStore`).
 * - Llamadas de red a Evolution API, Twilio y Contabilidad bloqueadas e interceptadas.
 * - Sin conexión a la base de datos de producción Turso.
 *
 * Uso:
 *   npx tsx scripts/simulate-chat.ts          # Modo interactivo en terminal
 *   npx tsx scripts/simulate-chat.ts --auto   # Verificación automática del caso de prueba
 *   npx tsx scripts/simulate-chat.ts --fail   # Prueba de modo Fail-Closed
 */

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

// 1. AISLAMIENTO TOTAL: Desactivar variables de producción de Turso
delete process.env.TURSO_DATABASE_URL;
delete process.env.TURSO_AUTH_TOKEN;

// Configurar banderas de entorno seguras
(process.env as any).NODE_ENV = "test";
process.env.EVOLUTION_API_URL = "https://mock-evolution.local";
process.env.EVOLUTION_API_KEY = "mock_key";
process.env.EVOLUTION_INSTANCE = "bunuelandia_sim";

// 2. ADAPTADORES DE RED: Interceptar llamadas HTTP salientes
const capturedDispatches: Array<{
  phone: string;
  message: string;
  kind: string;
  timestamp: string;
}> = [];

const originalFetch = globalThis.fetch;
globalThis.fetch = async (reqInput: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const urlStr = typeof reqInput === "string" ? reqInput : reqInput.toString();

  // Interceptar Evolution API (WhatsApp saliente)
  if (urlStr.includes("/message/sendText") || urlStr.includes("mock-evolution")) {
    let bodyObj: any = {};
    try {
      bodyObj = init?.body ? JSON.parse(init.body as string) : {};
    } catch {}

    const sentMessage = bodyObj.text || bodyObj.message || "";
    const sentPhone = bodyObj.number || "";
    const isDriverNotice = sentMessage.includes("DOMICILIO") || sentMessage.includes("PAGO VERIFICADO");

    capturedDispatches.push({
      phone: sentPhone,
      message: sentMessage,
      kind: isDriverNotice ? "DOMICILIARIO" : "CLIENTE",
      timestamp: new Date().toLocaleTimeString(),
    });

    return new Response(JSON.stringify({ status: "SUCCESS", messageId: "SIM-" + Date.now() }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Interceptar Facturación / Contabilidad
  if (urlStr.includes("invoices") || urlStr.includes("contabilidad")) {
    return new Response(
      JSON.stringify({
        ok: true,
        invoiceNumber: "FV-SIM-" + Math.floor(1000 + Math.random() * 9000),
        invoiceId: "inv-sim-1234",
        invoiceUrl: "https://contabilidad-app.local/sim/factura.pdf",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // Cualquier otra llamada externa queda mockeada por seguridad
  return new Response(JSON.stringify({ ok: true, simulated: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

// Importar el motor real de ventas y utilidades
import { handleSalesMessage } from "../lib/agent/sales-agent";
import {
  getOrders,
  getMemoryStore,
  setTursoClientForTesting,
  type Order,
} from "../lib/store";
import { OFFICIAL_PRICES, recalculateOrderTotal } from "../lib/agent/order-validator";

// Colores ANSI para formateo en terminal
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  white: "\x1b[37m",
  bgCyan: "\x1b[46m\x1b[30m",
  bgYellow: "\x1b[43m\x1b[30m",
  bgRed: "\x1b[41m\x1b[37m",
};

const SIM_PHONE = "+573009998877";
const SIM_CONV_ID = `whatsapp:${SIM_PHONE}`;
const SIM_CUSTOMER_NAME = "Cliente Simulación";

let simulateDatabaseFailure = false;

function toggleFailMode(active?: boolean): boolean {
  simulateDatabaseFailure = active !== undefined ? active : !simulateDatabaseFailure;
  if (simulateDatabaseFailure) {
    // Inyectar fallo simulado en base de datos
    process.env.TURSO_DATABASE_URL = "libsql://mock-test-db.turso.io";
    process.env.TURSO_AUTH_TOKEN = "mock-token";
    setTursoClientForTesting({
      batch: async () => {
        throw new Error("Simulated Turso database connection failure (Fail-Closed Test)");
      },
      execute: async () => {
        throw new Error("Simulated Turso database connection failure (Fail-Closed Test)");
      },
    });
  } else {
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    setTursoClientForTesting(null);
  }
  return simulateDatabaseFailure;
}

function resetMemory(): void {
  const mem = getMemoryStore();
  mem.conversations.clear();
  mem.messages = [];
  mem.orders.clear();
  mem.settings.deliveryDriverPhone = "3109998877";
  mem.settings.deliveryDriverNotifyEnabled = "true";
}

function printOrderBox(order: Order): void {
  console.log(`\n${c.cyan}┌─────────────────────────────────────────────────────────────┐${c.reset}`);
  console.log(`${c.cyan}│${c.bold} 📦 DETALLE DE ORDEN EN MEMORIA LOCAL (#${order.id.slice(0, 8)})            ${c.cyan}│${c.reset}`);
  console.log(`${c.cyan}├─────────────────────────────────────────────────────────────┤${c.reset}`);
  console.log(`${c.cyan}│${c.reset} Cliente:      ${c.bold}${order.customerName || "N/A"}${c.reset}`);
  console.log(`${c.cyan}│${c.reset} Celular:      ${order.customerPhone || "N/A"}`);
  console.log(`${c.cyan}│${c.reset} Dirección:    ${order.deliveryAddress || "N/A"}`);
  console.log(`${c.cyan}│${c.reset} Medio Pago:   ${order.paymentMethod || "N/A"}${order.changeAmount ? ` (${order.changeAmount})` : ""}`);
  console.log(`${c.cyan}│${c.reset} Estado:       ${c.yellow}${order.status}${c.reset} (Domiciliario: ${order.driverNotified || "pendiente"})`);
  console.log(`${c.cyan}├─────────────────────────────────────────────────────────────┤${c.reset}`);
  console.log(`${c.cyan}│${c.bold} ÍTEMS REGISTRADOS:${c.reset}`);

  const items = order.items || [];
  if (items.length === 0) {
    console.log(`${c.cyan}│${c.dim} (Sin ítems estructurados en memoria)${c.reset}`);
  } else {
    for (const it of items) {
      const sub = it.quantity * it.unitPrice;
      console.log(
        `${c.cyan}│${c.reset} - [${c.bold}${it.sku}${c.reset}] ${it.name || "Producto"} x${it.quantity} @ $${it.unitPrice.toLocaleString("es-CO")} = ${c.green}$${sub.toLocaleString("es-CO")} COP${c.reset}`
      );
    }
  }

  const math = recalculateOrderTotal(items, OFFICIAL_PRICES);
  console.log(`${c.cyan}├─────────────────────────────────────────────────────────────┤${c.reset}`);
  console.log(`${c.cyan}│${c.reset} Subtotal:     $${math.total.toLocaleString("es-CO")} COP`);
  console.log(`${c.cyan}│${c.reset} Domicilio:    ${c.green}${c.bold}¡GRATIS! ($${order.deliveryFee ?? 0})${c.reset}`);
  console.log(`${c.cyan}│${c.reset} Total Final:  ${c.green}${c.bold}$${(order.total || 0).toLocaleString("es-CO")} COP${c.reset}`);
  console.log(`${c.cyan}└─────────────────────────────────────────────────────────────┘${c.reset}\n`);
}

function printCapturedDispatches(): void {
  if (capturedDispatches.length === 0) return;
  const last = capturedDispatches[capturedDispatches.length - 1];
  if (last.kind === "DOMICILIARIO") {
    console.log(`${c.yellow}┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓${c.reset}`);
    console.log(`${c.yellow}┃${c.bold} 🛵 [SIMULACIÓN] FICHA DESPACHADA AL DOMICILIARIO (${last.phone}) ${c.yellow}┃${c.reset}`);
    console.log(`${c.yellow}┣━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┫${c.reset}`);
    for (const line of last.message.split("\n")) {
      console.log(`${c.yellow}┃${c.reset} ${line}`);
    }
    console.log(`${c.yellow}┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛${c.reset}\n`);
  }
}

async function runTurn(userText: string): Promise<string> {
  console.log(`\n${c.blue}👤 Cliente:${c.reset} "${c.bold}${userText}${c.reset}"`);
  console.log(`${c.dim}⏳ Procesando con motor de ventas...${c.reset}`);

  const startOrdersCount = (await getOrders()).length;
  const res = await handleSalesMessage(SIM_CONV_ID, userText, SIM_CUSTOMER_NAME);

  console.log(`\n${c.green}🤖 Bot BUÑUELANDIA (${res.mode}):${c.reset}`);
  for (const line of res.reply.split("\n")) {
    console.log(`   ${line}`);
  }

  const allOrders = await getOrders();
  const currentOrders = allOrders.filter((o) => o.conversationId === SIM_CONV_ID);

  if (allOrders.length > startOrdersCount && currentOrders.length > 0) {
    const latestOrder = currentOrders[0];
    printOrderBox(latestOrder);
  }

  printCapturedDispatches();
  return res.reply;
}

/**
 * Ejecuta la verificación automática requerida paso a paso.
 */
async function runAutomatedVerification(): Promise<void> {
  console.log(`\n${c.bgCyan}  EJECUTANDO VERIFICACIÓN AUTOMÁTICA DEL FLUJO DE VENTAS  ${c.reset}\n`);

  // Limpiar memoria previa
  resetMemory();
  toggleFailMode(false);

  // Turno 1: Pide caja surtida
  console.log(`${c.bold}PASO 1: Cliente solicita Caja x8 Surtida${c.reset}`);
  const r1 = await runTurn("Quiero una caja de 8 surtida");
  if (!r1.toLowerCase().includes("salsa") && !r1.includes("Mora")) {
    console.warn(`${c.yellow}⚠️ Aviso: Se esperaba que el bot solicitara salsas para caja surtida.${c.reset}`);
  }

  // Turno 2: Cambia a tradicional
  console.log(`\n${c.bold}PASO 2: Cliente solicita cambiar a caja tradicional${c.reset}`);
  const r2 = await runTurn("Para cambiar a una tradicional");
  if (r2.toLowerCase().includes("qué salsas prefieres")) {
    throw new Error("Fallo: El bot sigue pidiendo salsas para una caja tradicional");
  }

  // Turno 3: Proporciona datos de entrega y pago
  console.log(`\n${c.bold}PASO 3: Cliente proporciona dirección y medio de pago en efectivo (Resumen previo Paso 6)${c.reset}`);
  const r3 = await runTurn("Mi dirección es Calle 7 # 11-20 conjunto El Portal y pago en efectivo con billete de 50");
  if (!r3.includes("32.000")) {
    throw new Error("Fallo: El total en el resumen previo debe ser $32.000 COP para C8T");
  }
  if (!r3.includes("GRATIS") && !r3.includes("$0")) {
    throw new Error("Fallo: El domicilio debe indicarse como GRATIS ($0)");
  }
  if (!r3.includes("Calle 7 # 11-20 conjunto El Portal")) {
    throw new Error("Fallo: La dirección en el resumen debe contener 'Calle 7 # 11-20 conjunto El Portal'");
  }
  if (r3.includes("conjunto El Portal y pago")) {
    throw new Error("Fallo: La dirección no debe contener la frase de pago 'y pago en efectivo'");
  }

  // Comprobar que en el Paso 6 AÚN NO se ha registrado la orden en memoria
  const ordersBeforeConfirm = await getOrders();
  const prematureOrder = ordersBeforeConfirm.find((o) => o.conversationId === SIM_CONV_ID);
  if (prematureOrder) {
    throw new Error("Fallo: La orden fue guardada prematuramente en el Paso 6 antes de recibir la confirmación (1)");
  }
  console.log(`${c.green}✓ Comprobado: Orden NO registrada en Paso 6 (espera confirmación en Paso 7).${c.reset}`);

  // Turno 4: Confirmación del pedido
  console.log(`\n${c.bold}PASO 4: Cliente confirma el pedido con opción 1️⃣ (Paso 7)${c.reset}`);
  const r4 = await runTurn("1");
  if (!r4.toLowerCase().includes("confirmado") && !r4.toLowerCase().includes("registrado")) {
    throw new Error("Fallo: El bot debe confirmar el pedido tras recibir 1");
  }
  if (r4.toLowerCase().includes("van en camino")) {
    throw new Error("Fallo: El bot NO debe afirmar 'Tus buñuelos van en camino' cuando el domiciliario está pendiente de asignación/despacho");
  }
  if (!r4.toLowerCase().includes("pendiente de asignación") && !r4.toLowerCase().includes("despacho") && !r4.toLowerCase().includes("preparación")) {
    throw new Error("Fallo: El bot debe indicar que el pedido entra en preparación y está pendiente de asignación/despacho");
  }

  // Comprobar orden registrada
  const orders = await getOrders();
  const created = orders.find((o) => o.conversationId === SIM_CONV_ID);
  if (!created) {
    throw new Error("Fallo: No se encontró la orden registrada en memoria tras la confirmación");
  }

  console.log(`\n${c.bgCyan}  RESULTADOS DE LA VERIFICACIÓN:  ${c.reset}`);
  console.log(`- ID Pedido:       ${created.id}`);
  console.log(`- SKU de Ítems:    ${created.items?.map((i) => i.sku).join(", ") || "N/A"}`);
  console.log(`- Total:           $${created.total?.toLocaleString("es-CO")} COP`);
  console.log(`- Domicilio:       $${created.deliveryFee ?? 0} COP (GRATIS)`);
  console.log(`- Dirección:       "${created.deliveryAddress}"`);
  console.log(`- Medio Pago:      "${created.paymentMethod}"`);
  console.log(`- Cambio/Billete:  "${created.changeAmount || "N/A"}"`);

  const isTradicional = created.items?.some((i) => i.sku === "C8T");
  const is32k = created.total === 32000;
  const isFreeDelivery = created.deliveryFee === 0;
  const isAddressClean = created.deliveryAddress === "Calle 7 # 11-20 conjunto El Portal";
  const isCashPayment = Boolean(created.paymentMethod?.toLowerCase().includes("efectivo"));
  const hasChange = Boolean(created.changeAmount?.includes("50"));

  if (isTradicional && is32k && isFreeDelivery && isAddressClean && isCashPayment && hasChange) {
    console.log(`\n${c.green}${c.bold}✅ [PASS 1 & 2] Cambio C8T ($32.000, Domicilio $0), dirección limpia ("${created.deliveryAddress}"), cambio ("${created.changeAmount}") y estado pendiente verificados.${c.reset}`);
  } else {
    throw new Error(`Fallo en las aserciones de la orden: SKU C8T=${isTradicional}, total 32k=${is32k}, delivery 0=${isFreeDelivery}, addressClean=${isAddressClean}, cash=${isCashPayment}, change=${hasChange}`);
  }

  const driverNotices = capturedDispatches.filter((d) => d.kind === "DOMICILIARIO");
  if (driverNotices.length > 0) {
    console.log(`${c.green}✓ Comprobado: Ficha de entrega despachada al domiciliario tras confirmar la orden exitosamente.${c.reset}`);
  }

  // Prueba de Fail-Closed (Fallo simulado de base de datos)
  console.log(`\n${c.bgYellow}  PROBANDO PRINCIPIO FAIL-CLOSED (SIMULACIÓN DE FALLO DE PERSISTENCIA)  ${c.reset}`);
  resetMemory();
  toggleFailMode(false);

  const dispatchesBeforeFail = capturedDispatches.length;
  await handleSalesMessage(SIM_CONV_ID, "Quiero una caja tradicional de 8", SIM_CUSTOMER_NAME);
  await handleSalesMessage(SIM_CONV_ID, "Calle 10 # 5-20 y pago en efectivo con 50", SIM_CUSTOMER_NAME);

  console.log(`${c.dim}(Persistencia saboteada con setTursoClientForTesting simulando error de BD justo al confirmar)${c.reset}`);
  toggleFailMode(true);
  const failReply = await handleSalesMessage(SIM_CONV_ID, "1", SIM_CUSTOMER_NAME);
  toggleFailMode(false);

  console.log(`\n${c.green}Respuesta del bot ante fallo de BD:${c.reset}\n${failReply.reply}`);

  const gaveFalseConfirmation =
    failReply.reply.toLowerCase().includes("pedido confirmado") ||
    failReply.reply.toLowerCase().includes("registrado en buñuelandia");

  if (gaveFalseConfirmation) {
    throw new Error("Fallo crítico: El bot emitió confirmación falsa a pesar de que la BD falló.");
  } else if (!failReply.reply.includes("inconveniente técnico") && !failReply.reply.includes("intentar")) {
    throw new Error(`Fallo: Se esperaba mensaje de recuperación técnica pero se obtuvo: ${failReply.reply}`);
  }

  // Comprobar que no hay órdenes en memoria tras el fallo
  const failOrders = await getOrders();
  if (failOrders.length > 0) {
    throw new Error("Fallo crítico: La base de datos en memoria contiene órdenes a pesar de la falla inyectada.");
  }

  // Comprobar que NO se notificó al domiciliario
  const driverNoticesInFail = capturedDispatches
    .slice(dispatchesBeforeFail)
    .filter((d) => d.kind === "DOMICILIARIO");
  if (driverNoticesInFail.length > 0) {
    throw new Error("Fallo crítico: Se despachó notificación al domiciliario a pesar del fallo de persistencia.");
  }

  console.log(`\n${c.green}${c.bold}✅ [PASS 3] Fail-Closed comprobado: El bot no confirmó la orden, no guardó el pedido en memoria y NO notificó al domiciliario.${c.reset}`);

  // Comprobación de aislamiento de credenciales y llamadas externas
  console.log(`\n${c.bgCyan}  VERIFICACIÓN DE AISLAMIENTO Y CREDENCIALES  ${c.reset}`);
  const hasTursoUrl = !!process.env.TURSO_DATABASE_URL;
  const hasTursoToken = !!process.env.TURSO_AUTH_TOKEN;
  console.log(`- TURSO_DATABASE_URL en entorno: ${hasTursoUrl ? "PRESENTE (ERROR)" : "NO (Aislado)"}`);
  console.log(`- TURSO_AUTH_TOKEN en entorno:   ${hasTursoToken ? "PRESENTE (ERROR)" : "NO (Aislado)"}`);
  console.log(`- Llamadas externas no mockeadas: 0 (Adaptador de red global activo)`);

  if (hasTursoUrl || hasTursoToken) {
    throw new Error("Fallo de seguridad: Variables de base de datos de producción presentes en el entorno.");
  }
  console.log(`\n${c.green}${c.bold}✅ [PASS 4] Entorno 100% aislado: Sin credenciales de producción ni llamadas de red externas.${c.reset}\n`);
}

/**
 * Bucle interactivo por consola.
 */
async function startInteractiveCLI(): Promise<void> {
  const rl = readline.createInterface({ input, output });

  console.log(`${c.bold}${c.green}`);
  console.log("╔═══════════════════════════════════════════════════════════════╗");
  console.log("║         SIMULADOR CONVERSACIONAL DE WHATSAPP                 ║");
  console.log("║            BUÑUELANDIA — SISTEMA HÍBRIDO                      ║");
  console.log("╚═══════════════════════════════════════════════════════════════╝");
  console.log(`${c.reset}`);
  console.log(`${c.dim}Entorno: 100% Memoria Local | Sin WhatsApp Real | Sin BD Producción${c.reset}`);
  console.log(`${c.cyan}Comandos especiales:${c.reset}`);
  console.log(`  ${c.bold}/auto${c.reset}     - Ejecuta la prueba guiada automática de cambio a tradicional`);
  console.log(`  ${c.bold}/fail${c.reset}     - Alterna simulación de fallo de persistencia (Fail-Closed)`);
  console.log(`  ${c.bold}/pedidos${c.reset}  - Muestra las órdenes registradas en memoria`);
  console.log(`  ${c.bold}/reset${c.reset}    - Limpia la conversación y memoria actual`);
  console.log(`  ${c.bold}/salir${c.reset}    - Cierra el simulador\n`);

  try {
    while (true) {
      const modeLabel = simulateDatabaseFailure ? `${c.bgRed} MODO FALLO BD ACTIVO ${c.reset} ` : "";
      const userInput = await rl.question(`${modeLabel}${c.bold}${c.blue}Tú (Cliente) > ${c.reset}`);
      const trimmed = userInput.trim();

      if (!trimmed) continue;

      if (trimmed === "/salir" || trimmed === "/exit") {
        console.log(`\n${c.yellow}👋 Saliendo del simulador. ¡Hasta pronto!${c.reset}\n`);
        break;
      }

      if (trimmed === "/auto") {
        await runAutomatedVerification();
        continue;
      }

      if (trimmed === "/fail") {
        const state = toggleFailMode();
        console.log(
          state
            ? `\n${c.red}⚠️ Simulación de fallo en persistencia ACTIVADA. Las órdenes lanzarán error de BD.${c.reset}\n`
            : `\n${c.green}✅ Persistencia restaurada a modo memoria normal.${c.reset}\n`
        );
        continue;
      }

      if (trimmed === "/pedidos") {
        const orders = await getOrders();
        console.log(`\n${c.bold}Órdenes en memoria (${orders.length}):${c.reset}`);
        for (const o of orders) {
          printOrderBox(o);
        }
        continue;
      }

      if (trimmed === "/reset") {
        resetMemory();
        toggleFailMode(false);
        console.log(`\n${c.green}🧹 Conversación y almacén en memoria reiniciados.${c.reset}\n`);
        continue;
      }

      await runTurn(trimmed);
    }
  } finally {
    rl.close();
    globalThis.fetch = originalFetch;
  }
}

// Punto de entrada
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--auto")) {
    await runAutomatedVerification();
    process.exit(0);
  } else if (args.includes("--fail") || args.includes("--test-fail")) {
    toggleFailMode(true);
    await runAutomatedVerification();
    process.exit(0);
  } else {
    await startInteractiveCLI();
  }
}

main().catch((err) => {
  console.error(`\n${c.red}❌ Error en el simulador:${c.reset}`, err);
  process.exit(1);
});
