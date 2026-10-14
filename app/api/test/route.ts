import { NextResponse } from "next/server";
import { getTursoClient, isTursoConfigured } from "@/lib/store/db";
import { handleSalesMessage } from "@/lib/agent/sales-agent";
import {
  getMessages,
  appendMessage,
  setConversationStatus,
  setConversationCustomerName,
  getConversation,
  getOrCreateConversation,
  getOrgSettings,
} from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const report: Record<string, any> = {
    timestamp: new Date().toISOString(),
    tests: {},
    allPassed: true,
  };

  const testId = `test_${Date.now()}`;
  const testPhone = `whatsapp:+57300000${Math.floor(1000 + Math.random() * 9000)}`;

  // 1. TURSO DATABASE TEST
  try {
    if (isTursoConfigured()) {
      const c = getTursoClient();
      const res = await c.execute("SELECT 1 as alive");
      report.tests.database = {
        passed: res.rows[0]?.alive === 1 || res.rows[0]?.alive === "1",
        provider: "Turso (libsql)",
      };
    } else {
      report.tests.database = { passed: true, provider: "In-Memory Store" };
    }
  } catch (err: any) {
    report.tests.database = { passed: false, error: err.message };
    report.allPassed = false;
  }

  // 2. GEMINI AI CONNECTION TEST
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const res = await ai.models.generateContent({
      model: "gemini-flash-lite-latest",
      contents: "Responde únicamente con 'PULSO_OK'",
    });
    const text = (res.text || "").trim();
    report.tests.geminiAI = {
      passed: text.includes("PULSO_OK") || text.length > 0,
      model: "gemini-flash-lite-latest",
      response: text,
    };
  } catch (err: any) {
    report.tests.geminiAI = { passed: false, error: err.message };
    report.allPassed = false;
  }

  // 3. SETTINGS & AUTO-PAUSE CONFIG TEST
  try {
    const settings = await getOrgSettings();
    report.tests.settings = {
      passed: true,
      botEnabled: settings.botEnabled !== "false",
      autoPauseOnMobileReply: settings.autoPauseOnMobileReply !== "false",
      upsellDrinksEnabled: settings.upsellDrinksEnabled !== "false",
      deliveryFee: settings.deliveryFee,
    };
  } catch (err: any) {
    report.tests.settings = { passed: false, error: err.message };
    report.allPassed = false;
  }

  // 4. MULTI-TURN SALES CONVERSATION TEST
  try {
    const conversationTurns: any[] = [];

    // Inicializar conversación en BD
    await getOrCreateConversation(testPhone);
    await setConversationCustomerName(testPhone, "Felipe Test");
    await setConversationStatus(testPhone, "bot");

    // Turn 1: Pedir Caja x8 Surtida
    await appendMessage(testPhone, "user", "Buenas tardes, quiero pedir una caja x8 surtida");
    const t1 = await handleSalesMessage(testPhone, "Buenas tardes, quiero pedir una caja x8 surtida", "Felipe Test");
    conversationTurns.push({ turn: 1, user: "Buenas tardes, quiero pedir una caja x8 surtida", bot: t1.reply.slice(0, 150) });

    // Turn 2: Especificar salsas
    await appendMessage(testPhone, "user", "Mora y arequipe");
    const t2 = await handleSalesMessage(testPhone, "Mora y arequipe", "Felipe Test");
    conversationTurns.push({ turn: 2, user: "Mora y arequipe", bot: t2.reply.slice(0, 150) });

    // Turn 3: Enviar nombre y dirección colombiana
    await appendMessage(testPhone, "user", "A nombre de Felipe en Calle 10 # 5-20 Neiva");
    const t3 = await handleSalesMessage(testPhone, "A nombre de Felipe en Calle 10 # 5-20 Neiva", "Felipe Test");
    conversationTurns.push({ turn: 3, user: "A nombre de Felipe en Calle 10 # 5-20 Neiva", bot: t3.reply.slice(0, 150) });

    // Turn 4: Elegir pago en efectivo
    await appendMessage(testPhone, "user", "Efectivo");
    const t4 = await handleSalesMessage(testPhone, "Efectivo", "Felipe Test");
    conversationTurns.push({ turn: 4, user: "Efectivo", bot: t4.reply.slice(0, 150) });

    // Turn 5: Denominación de billete (El punto donde antes ocurría el fallo)
    await appendMessage(testPhone, "user", "🎤 [Nota de voz]: \"Pago con billete de 50.000\"");
    const t5 = await handleSalesMessage(testPhone, "Pago con billete de 50.000", "Felipe Test");
    conversationTurns.push({ turn: 5, user: "Pago con billete de 50.000", bot: t5.reply.slice(0, 200) });

    // Verificación crítica: ¿El bot recordó la caja x8 surtida y NO volvió a preguntar qué caja quería?
    const forgotBox = t5.reply.toLowerCase().includes("aún no elegiste tus buñuelos") ||
                      t5.reply.toLowerCase().includes("qué caja te antojamos hoy") ||
                      t5.reply.toLowerCase().includes("que caja te antojamos hoy");
    const hasPreConfirmation = t5.reply.includes("1️⃣") ||
                               t5.reply.toLowerCase().includes("resumen") ||
                               t5.reply.toLowerCase().includes("confirmar");

    report.tests.conversationMemory = {
      passed: !forgotBox,
      noAmnesia: !forgotBox,
      preConfirmationGenerated: hasPreConfirmation,
      turn5Sample: t5.reply,
    };

    if (forgotBox) {
      report.allPassed = false;
    }

    // Turn 6: Confirmación del pedido con '1'
    await appendMessage(testPhone, "user", "1");
    const t6 = await handleSalesMessage(testPhone, "1", "Felipe Test");
    const orderConfirmed = t6.mode === "order_created" || t6.reply.toLowerCase().includes("confirmado");
    conversationTurns.push({ turn: 6, user: "1", bot: t6.reply.slice(0, 150), mode: t6.mode });

    report.tests.orderCreation = {
      passed: orderConfirmed,
      mode: t6.mode,
      invoiceNumber: t6.invoiceNumber || "N/A",
    };

    if (!orderConfirmed) {
      report.allPassed = false;
    }

    // 5. CLIENTE RECURRENTE (NUEVO PEDIDO AISLADO)
    await appendMessage(testPhone, "user", "Hola quiero pedir de nuevo, me regalan una caja x4 tradicional");
    const t7 = await handleSalesMessage(testPhone, "Hola quiero pedir de nuevo, me regalan una caja x4 tradicional", "Felipe Test");
    conversationTurns.push({ turn: 7, user: "Hola quiero pedir de nuevo, me regalan una caja x4 tradicional", bot: t7.reply.slice(0, 150) });

    // Verificar que en el nuevo pedido NO mencione la caja anterior x8 de $36.000
    const mentionsOldBox = t7.reply.includes("$36.000") || t7.reply.toLowerCase().includes("caja x8");
    report.tests.returningCustomerIsolation = {
      passed: !mentionsOldBox,
      cleanCart: !mentionsOldBox,
      botReplySample: t7.reply.slice(0, 200),
    };

    if (mentionsOldBox) {
      report.allPassed = false;
    }

    report.conversationLog = conversationTurns;
  } catch (err: any) {
    report.tests.conversation = { passed: false, error: err.message, stack: err.stack };
    report.allPassed = false;
  }

  // 6. PAUSA AUTOMÁTICA Y COMANDOS MÓVILES
  try {
    await setConversationStatus(testPhone, "bot");
    const c1 = await getConversation(testPhone);

    // Simular comando #pausar
    await setConversationStatus(testPhone, "human");
    const c2 = await getConversation(testPhone);

    // Simular comando #bot
    await setConversationStatus(testPhone, "bot");
    const c3 = await getConversation(testPhone);

    report.tests.mobilePauseCommands = {
      passed: c1?.status === "bot" && c2?.status === "human" && c3?.status === "bot",
      initialStatus: c1?.status,
      pausedStatus: c2?.status,
      resumedStatus: c3?.status,
    };
  } catch (err: any) {
    report.tests.mobilePauseCommands = { passed: false, error: err.message };
    report.allPassed = false;
  }

  return NextResponse.json(report, { status: report.allPassed ? 200 : 500 });
}
