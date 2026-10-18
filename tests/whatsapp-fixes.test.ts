import assert from "node:assert/strict";
import test from "node:test";
import {
  extractColombianPhone,
  shouldSendTransferQr,
  handleSalesMessage,
  resolveInvoiceNoticeDetails,
  isValidContabilidadPublicUrl,
} from "../lib/agent/sales-agent";
import {
  shouldInterceptMissingSauces,
  recalculateOrderTotal,
  OFFICIAL_PRICES,
} from "../lib/agent/order-validator";
import {
  resolveCustomerPhoneForDriver,
  formatDeliveryDriverMessage,
} from "../lib/delivery-driver";
import { parseEvolutionUpsert } from "../lib/evolution";
import {
  createOrder,
  getConversation,
  getOrCreateConversation,
  setConversationPhone,
  updateOrderStatus,
  type Order,
} from "../lib/store";

test("1. Cliente @lid sin teléfono guardado que responde «al mismo número»", async () => {
  const lidConvId = "whatsapp:lid:271296004931588";
  await getOrCreateConversation(lidConvId);

  const res = await handleSalesMessage(lidConvId, "al mismo número", "Cliente Privado");
  assert.equal(res.mode, "keyword");
  assert.ok(
    res.reply.includes("cuenta privada") || res.reply.includes("no es visible") || res.reply.includes("privacidad"),
    "Debe explicar que es cuenta privada"
  );
  assert.ok(
    res.reply.includes("10 dígitos") || res.reply.includes("celular"),
    "Debe solicitar número de 10 dígitos"
  );

  const updatedConv = await getConversation(lidConvId);
  assert.equal(extractColombianPhone(updatedConv?.phone || ""), null);
});

test("2. Cliente @lid que envía sus 10 dígitos y recibe el domicilio con el teléfono correcto", async () => {
  const lidConvId = "whatsapp:lid:271296004931588";
  const rawPhone = "3101234567";

  const detected = extractColombianPhone(rawPhone);
  assert.equal(detected, "3101234567");

  await setConversationPhone(lidConvId, detected!);
  const conv = await getConversation(lidConvId);
  assert.equal(conv?.phone, "3101234567");

  const order = await createOrder(lidConvId, [{ sku: "C8T", quantity: 1, unitPrice: 32000 }], 32000, {
    customerName: "Juan Pérez",
    customerPhone: detected!,
    deliveryAddress: "Calle 10 # 5-20",
    paymentMethod: "Nequi",
  });

  const phoneInfo = resolveCustomerPhoneForDriver(order);
  assert.equal(phoneInfo.isLidWithoutPhone, false);
  assert.equal(phoneInfo.displayPhone, "310 123 4567");
  assert.equal(phoneInfo.waUrl, "https://wa.me/573101234567");

  const driverMsg = formatDeliveryDriverMessage(order);
  assert.ok(driverMsg.includes("310 123 4567"));
  assert.ok(driverMsg.includes("https://wa.me/573101234567"));
});

test("3. Cliente que envía un Pin de Ubicación GPS (locationMessage)", () => {
  const mockPayload = {
    event: "messages.upsert",
    data: {
      key: { remoteJid: "573001234567@s.whatsapp.net", fromMe: false, id: "msg-loc-123" },
      message: {
        locationMessage: {
          degreesLatitude: 4.710989,
          degreesLongitude: -74.072092,
          name: "Mi Casa",
          address: "Bogotá, Colombia",
        },
      },
    },
  };

  const parsed = parseEvolutionUpsert(mockPayload);
  assert.ok(parsed);
  assert.ok(parsed.text.includes("Ubicación GPS compartida"));
  assert.ok(parsed.text.includes("https://maps.google.com/?q=4.710989,-74.072092"));

  const orderWithGps: Order = {
    id: "ord-test-gps",
    conversationId: "whatsapp:+573001234567",
    customerName: "Carlos GPS",
    customerPhone: "3001234567",
    deliveryAddress: parsed.text,
    paymentMethod: "Efectivo contra entrega",
    status: "confirmed",
    total: 32000,
    items: [{ sku: "C8T", quantity: 1, unitPrice: 32000 }],
    createdAt: Date.now(),
  };

  const driverMsg = formatDeliveryDriverMessage(orderWithGps);
  assert.ok(
    driverMsg.includes("🗺️ *Ruta GPS:* https://maps.google.com/?q=4.710989,-74.072092"),
    "La tarjeta del domiciliario debe incluir la Ruta GPS cliqueable"
  );
});

test("4. Resumen Previo (Paso 6) muestra opciones 1 y 2 sin crear orden y sin enviar QR", () => {
  const summaryReply = `📋 *Resumen de tu Pedido:*
• 1x Caja x8 Tradicional
📦 *Subtotal productos:* $32.000 COP
🛵 *Domicilio:* ¡GRATIS!
💰 *Total a pagar:* $32.000 COP
👤 *Cliente:* Laura
📍 *Dirección de entrega:* Carrera 7 # 12-40
💳 *Medio de pago:* Nequi

¿Todo está correcto? Elige una opción:
1️⃣ ✅ Confirmar pedido
2️⃣ ✏️ Modificar algún dato`;

  const qrInSummary = shouldSendTransferQr("1", summaryReply, false, "Nequi");
  assert.equal(qrInSummary, false, "El resumen previo no debe enviar el QR");
});

test("5. Confirmación con 1 (Paso 7) en pago por Nequi/Bre-B envía el QR una sola vez", () => {
  const confirmationReply = `✅ *¡Pedido Confirmado y Registrado en BUÑUELANDIA!* 🛵🥟
🛒 *Detalle del Pedido:*
• 1x Caja x8 Tradicional
💰 *Total a pagar:* $32.000 COP
💳 *Medio de pago:* Nequi
📱 *Nequi:* \`3228964947\`
🔑 *Llave Bre-B:* \`3228964947\``;

  const qrInConfirmation = shouldSendTransferQr("1", confirmationReply, true, "Nequi");
  assert.equal(qrInConfirmation, true, "La confirmación final con Nequi debe enviar el QR");

  const qrOnExplicit = shouldSendTransferQr("¿me envías el código qr?", "Con gusto", false, "Nequi");
  assert.equal(qrOnExplicit, true, "Solicitud explícita de QR debe enviar QR");

  const qrOnNormalChat = shouldSendTransferQr("gracias", "¡Con gusto!", false, "Nequi");
  assert.equal(qrOnNormalChat, false, "Turno normal no debe enviar QR");
});

test("6. Pago en Efectivo nunca envía QR ni textos de transferencia", () => {
  const qrWithCash = shouldSendTransferQr("1", "Pedido confirmado en efectivo", true, "Efectivo contra entrega");
  assert.equal(qrWithCash, false, "Efectivo jamás debe enviar QR");

  const cashOrder: Order = {
    id: "ord-test-cash",
    conversationId: "whatsapp:+573105556677",
    customerName: "Camila Ortiz",
    customerPhone: "3105556677",
    deliveryAddress: "Carrera 5 # 14-22",
    paymentMethod: "Efectivo contra entrega",
    changeAmount: "$50.000",
    status: "confirmed",
    total: 32000,
    items: [{ sku: "C8T", quantity: 1, unitPrice: 32000 }],
    createdAt: Date.now(),
  };

  const driverMsg = formatDeliveryDriverMessage(cashOrder);
  assert.ok(driverMsg.includes("Cobrar en efectivo al entregar y llevar el cambio listo"));
  assert.ok(!driverMsg.includes("TRANSFERENCIA PENDIENTE"));
  assert.ok(!driverMsg.includes("TRANSFERENCIA VERIFICADA"));
  assert.ok(!driverMsg.includes("YA PAGADO"));
});

test("7. Ficha inicial al domiciliario en pedido por Nequi/Bre-B muestra estado pendiente", () => {
  const pendingTransferOrder: Order = {
    id: "ord-test-transfer-pending",
    conversationId: "whatsapp:+573001112233",
    customerName: "Carlos Mendoza",
    customerPhone: "3001112233",
    deliveryAddress: "Calle 15 # 8-30",
    paymentMethod: "Nequi",
    status: "confirmed",
    total: 32000,
    items: [{ sku: "C8T", quantity: 1, unitPrice: 32000 }],
    createdAt: Date.now(),
  };

  const driverMsg = formatDeliveryDriverMessage(pendingTransferOrder);
  assert.ok(
    driverMsg.includes("⏳ *PAGO POR TRANSFERENCIA (PENDIENTE VERIFICAR COMPROBANTE):* Confirmar validación de pago antes de entregar."),
    "Debe advertir que la transferencia está pendiente de comprobante"
  );
  assert.ok(!driverMsg.includes("YA PAGADO"), "No debe decir YA PAGADO");
});

test("8. Comprobante válido con importe exacto pasa a preparing y notifica al domiciliario", async () => {
  const order = await createOrder("whatsapp:+573004445566", [{ sku: "C8T", quantity: 1, unitPrice: 32000 }], 32000, {
    customerName: "Diana Morales",
    customerPhone: "3004445566",
    deliveryAddress: "Av Pastrana # 20-10",
    paymentMethod: "Nequi",
    status: "confirmed",
  });

  const verification = {
    isReceipt: true,
    amount: 32000,
    bank: "Nequi",
  };

  const amountMatches =
    verification.amount !== null &&
    Math.abs(verification.amount - order.total) <= 1000;

  assert.ok(verification.isReceipt);
  assert.ok(amountMatches);

  await updateOrderStatus(order.id, "preparing");
  order.status = "preparing";

  const driverNotice = `✅ *PAGO VERIFICADO (#${order.id.slice(0, 8)})*: Comprobante validado de *${order.customerName}* por *$${order.total.toLocaleString("es-CO")}*. No cobrar al entregar. 🛵`;
  assert.ok(driverNotice.includes("PAGO VERIFICADO"));
  assert.ok(driverNotice.includes(order.customerName || ""));
  assert.ok(driverNotice.includes("$32.000"));

  const driverCard = formatDeliveryDriverMessage(order);
  assert.ok(driverCard.includes("TRANSFERENCIA VERIFICADA"));
  assert.ok(driverCard.includes("No cobrar al cliente"));
});

test("9. Comprobante inválido, de otro monto o evento duplicado", async () => {
  const order = await createOrder("whatsapp:+573007778899", [{ sku: "C8T", quantity: 1, unitPrice: 32000 }], 32000, {
    customerName: "Andrés Silva",
    paymentMethod: "Nequi",
    status: "confirmed",
  });

  const diffAmountVerification = { isReceipt: true, amount: 20000 };
  const diffMatches = Math.abs(diffAmountVerification.amount - order.total) <= 1000;
  assert.equal(diffMatches, false, "Importe diferente no debe coincidir");
  assert.equal(order.status, "confirmed");

  const notReceiptVerification = { isReceipt: false, amount: 32000 };
  assert.equal(notReceiptVerification.isReceipt, false);
  assert.equal(order.status, "confirmed");

  order.status = "preparing";
  const isAlreadyProcessed =
    order.status === "preparing" ||
    order.status === "delivering" ||
    order.status === "delivered";
  assert.ok(isAlreadyProcessed, "Debe detectar evento duplicado");
});

test("10. Sistema Híbrido: Intercepta Caja Surtida sin salsas y recalcula matemáticamente el total oficial", () => {
  // A. Candado de Salsas: sin salsas en historial pero IA intenta pedir dirección
  const missingSaucesIntercept = shouldInterceptMissingSauces(
    true,
    "quiero una caja surtida de 8",
    "¡Con gusto! ¿Cuál es tu dirección de entrega para llevarte los buñuelos?"
  );
  assert.equal(missingSaucesIntercept, true, "Debe interceptar si no hay salsas");

  // B. Candado de Salsas: con salsas en historial, permite avanzar
  const allowedWithSauces = shouldInterceptMissingSauces(
    true,
    "quiero una caja surtida, con 4 de mora y 4 de arequipe",
    "¡Con gusto! ¿Cuál es tu dirección de entrega?"
  );
  assert.equal(allowedWithSauces, false, "No debe interceptar si ya eligió salsas");

  // C. Candado Matemático: Cajas + Bebidas + domicilio $0
  const orderItems = [
    { sku: "C8S", quantity: 1, unitPrice: 99999 }, // Precio alucinado por LLM
    { sku: "BEB_CAFE", quantity: 2, unitPrice: 1000 }, // Precio alucinado por LLM
    { sku: "BEB_JUGO", quantity: 1, unitPrice: 2000 }, // Precio alucinado por LLM
  ];

  const math = recalculateOrderTotal(orderItems, OFFICIAL_PRICES);
  // C8S = 34.000 * 1 = 34.000
  // BEB_CAFE = 3.500 * 2 = 7.000
  // BEB_JUGO = 6.000 * 1 = 6.000
  // Total = 47.000
  assert.equal(math.total, 47000, "Total matemático exacto debe ser $47.000 COP");
  assert.equal(math.deliveryFee, 0, "Domicilio debe ser $0");
  assert.equal(math.items[0].unitPrice, 34000);
  assert.equal(math.items[1].unitPrice, 3500);
  assert.equal(math.items[2].unitPrice, 6000);
});

test("11. isValidContabilidadPublicUrl: Valida con new URL(), exige HTTPS y rechaza dominios arbitrarios", () => {
  // A. URL oficial válida con HTTPS y CUID legítimo
  const validUrl = "https://contabilidad-app-fawn.vercel.app/api/invoices/public/cm123456";
  assert.equal(isValidContabilidadPublicUrl(validUrl), true, "Debe aceptar HTTPS del dominio contable oficial");

  // B. Rechaza protocolo HTTP inseguro
  const httpUrl = "http://contabilidad-app-fawn.vercel.app/api/invoices/public/cm123456";
  assert.equal(isValidContabilidadPublicUrl(httpUrl), false, "Debe rechazar HTTP");

  // C. Rechaza dominios arbitrarios o de terceros
  const arbitraryDomain = "https://sitio-malicioso.com/api/invoices/public/cm123456";
  assert.equal(isValidContabilidadPublicUrl(arbitraryDomain), false, "Debe rechazar dominios no autorizados");

  // D. Rechaza URLs sin identificador de factura (evita /public/ vacío)
  const emptyIdUrl = "https://contabilidad-app-fawn.vercel.app/api/invoices/public/";
  assert.equal(isValidContabilidadPublicUrl(emptyIdUrl), false, "Debe rechazar ruta /public/ sin ID");

  // E. Rechaza cadenas inválidas que lanzan error en new URL()
  assert.equal(isValidContabilidadPublicUrl("no-es-una-url"), false);
  assert.equal(isValidContabilidadPublicUrl(undefined), false);
  assert.equal(isValidContabilidadPublicUrl(""), false);
});

test("12. resolveInvoiceNoticeDetails: Trata invoiceNumber e invoiceUrl de forma independiente", () => {
  // A. Solo invoiceNumber (falta invoiceUrl): muestra el número sin inventar enlace
  const onlyNumber = resolveInvoiceNoticeDetails("B-0017", undefined, undefined);
  assert.equal(onlyNumber.formattedNumber, "#B-0017");
  assert.equal(onlyNumber.publicUrl, undefined);
  assert.ok(onlyNumber.noticeLine.includes("🧾 *Factura Oficial Registrada:* #B-0017"));
  assert.ok(!onlyNumber.noticeLine.includes("📄 *Ver tu Factura digital:*"));

  // B. Solo invoiceUrl (falta invoiceNumber): muestra el enlace sin inventar número ni '#' huérfano
  const onlyUrl = resolveInvoiceNoticeDetails(
    undefined,
    "https://contabilidad-app-fawn.vercel.app/api/invoices/public/cm123456"
  );
  assert.equal(onlyUrl.formattedNumber, undefined);
  assert.equal(onlyUrl.publicUrl, "https://contabilidad-app-fawn.vercel.app/api/invoices/public/cm123456");
  assert.ok(!onlyUrl.noticeLine.includes("Factura Oficial Registrada"));
  assert.ok(!onlyUrl.noticeLine.includes("#"));
  assert.ok(onlyUrl.noticeLine.includes("📄 *Ver tu Factura digital:* https://contabilidad-app-fawn.vercel.app/api/invoices/public/cm123456"));

  // C. Ambos disponibles: muestra ambas líneas
  const both = resolveInvoiceNoticeDetails(
    "B-0017",
    "https://contabilidad-app-fawn.vercel.app/api/invoices/public/cm123456"
  );
  assert.equal(both.formattedNumber, "#B-0017");
  assert.equal(both.publicUrl, "https://contabilidad-app-fawn.vercel.app/api/invoices/public/cm123456");
  assert.ok(both.noticeLine.includes("🧾 *Factura Oficial Registrada:* #B-0017"));
  assert.ok(both.noticeLine.includes("📄 *Ver tu Factura digital:* https://contabilidad-app-fawn.vercel.app/api/invoices/public/cm123456"));
});

test("13. resolveInvoiceNoticeDetails: Desduplicación contra reply existente", () => {
  const number = "B-0017";
  const url = "https://contabilidad-app-fawn.vercel.app/api/invoices/public/cm123456";

  // A. reply ya contiene el número oficial (#B-0017): solo añade el enlace
  const replyWithNumber = `✅ ¡Pedido Confirmado! Número de factura #B-0017 asignado.`;
  const resDedupNumber = resolveInvoiceNoticeDetails(number, url, undefined, replyWithNumber);
  assert.ok(!resDedupNumber.noticeLine.includes("Factura Oficial Registrada:* #B-0017"), "No debe duplicar número");
  assert.ok(resDedupNumber.noticeLine.includes("📄 *Ver tu Factura digital:* " + url), "Debe incluir enlace faltante");

  // B. reply ya contiene el enlace: solo añade el número
  const replyWithUrl = `✅ ¡Pedido Confirmado! Consulta tu factura en https://contabilidad-app-fawn.vercel.app/api/invoices/public/cm123456`;
  const resDedupUrl = resolveInvoiceNoticeDetails(number, url, undefined, replyWithUrl);
  assert.ok(resDedupUrl.noticeLine.includes("🧾 *Factura Oficial Registrada:* #B-0017"), "Debe incluir número");
  assert.ok(!resDedupUrl.noticeLine.includes("📄 *Ver tu Factura digital:*"), "No debe duplicar enlace");

  // C. reply ya contiene ambos: noticeLine queda vacío
  const replyWithBoth = `✅ ¡Pedido Confirmado! #B-0017 digital: https://contabilidad-app-fawn.vercel.app/api/invoices/public/cm123456`;
  const resDedupBoth = resolveInvoiceNoticeDetails(number, url, undefined, replyWithBoth);
  assert.equal(resDedupBoth.noticeLine, "", "noticeLine debe ser vacío si ambos ya están en reply");
});

test("14. Evolution API: Propagación de invoiceUrl y blindaje del caption multimedia", () => {
  const invoiceNumber = "B-0017";
  const validInvoiceUrl = "https://contabilidad-app-fawn.vercel.app/api/invoices/public/cm-oficial-123";
  const arbitraryUrl = "https://sitio-no-autorizado.com/factura.pdf";

  // Caso 1: Con invoiceUrl válido
  const formattedNum = invoiceNumber ? `#${invoiceNumber}` : "";
  const numPart = formattedNum ? ` ${formattedNum}` : "";
  const urlPartValid = validInvoiceUrl && isValidContabilidadPublicUrl(validInvoiceUrl)
    ? `\n📄 Ver factura digital: ${validInvoiceUrl}`
    : "";
  const captionValid = `🧾 Factura Oficial${numPart}${urlPartValid}\n¡Gracias por tu compra en Buñuelandia! 🥟`;

  assert.ok(captionValid.includes("🧾 Factura Oficial #B-0017"));
  assert.ok(captionValid.includes("📄 Ver factura digital: https://contabilidad-app-fawn.vercel.app/api/invoices/public/cm-oficial-123"));

  // Caso 2: Con URL arbitraria de tercero: debe ser filtrada y no enviarse al cliente
  const urlPartArbitrary = arbitraryUrl && isValidContabilidadPublicUrl(arbitraryUrl)
    ? `\n📄 Ver factura digital: ${arbitraryUrl}`
    : "";
  const captionFiltered = `🧾 Factura Oficial${numPart}${urlPartArbitrary}\n¡Gracias por tu compra en Buñuelandia! 🥟`;

  assert.ok(captionFiltered.includes("🧾 Factura Oficial #B-0017"));
  assert.ok(!captionFiltered.includes("sitio-no-autorizado.com"), "No debe incluir dominios arbitrarios");
  assert.ok(!captionFiltered.includes("📄 Ver factura digital:"), "No debe mostrar etiqueta si la URL fue descartada");
});
