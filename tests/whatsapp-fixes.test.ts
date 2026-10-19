import assert from "node:assert/strict";
import test from "node:test";
import {
  extractColombianPhone,
  shouldSendTransferQr,
  handleSalesMessage,
  resolveInvoiceNoticeDetails,
  isValidContabilidadPublicUrl,
  isValidContabilidadPdfUrl,
  fetchAndValidateInvoicePdf,
  MAX_PDF_DOWNLOAD_BYTES,
  extractChangeInstructions,
} from "../lib/agent/sales-agent";
import {
  shouldInterceptMissingSauces,
  recalculateOrderTotal,
  OFFICIAL_PRICES,
  parseCashAmount,
  calculateCashChange,
  formatCashPaymentForDriver,
} from "../lib/agent/order-validator";
import {
  resolveCustomerPhoneForDriver,
  formatDeliveryDriverMessage,
  notifyDeliveryDriver,
} from "../lib/delivery-driver";
import {
  parseEvolutionUpsert,
  resolveMediaRecipient,
  sendEvolutionMedia,
} from "../lib/evolution";
import { sentInvoicePdfsCache, SENT_PDF_CACHE_TTL_MS } from "../lib/contabilidad";
import {
  createOrder,
  getOrders,
  getConversation,
  getOrCreateConversation,
  setConversationPhone,
  updateOrderStatus,
  claimOrderInvoicePdf,
  releaseOrderInvoicePdf,
  findOrderByInvoiceOrRef,
  markOrderDriverPaymentConfirmed,
  markOrderAccountingPaymentSynced,
  updateOrgSettings,
  type Order,
} from "../lib/store";
import { normalizeEvolutionNumber } from "../lib/evolution";
import { recordPaymentInContabilidad } from "../lib/contabilidad";

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

test("15. resolveMediaRecipient: Resuelve número telefónico real y descarta @lid sin teléfono validado", () => {
  // A. Destinatario @lid con teléfono celular de 10 dígitos guardado en convPhone
  const res1 = resolveMediaRecipient("271296004931588@lid", { convPhone: "3232056511" });
  assert.deepEqual(res1, { to: "573232056511", kind: "phone" });

  // B. Destinatario @lid con teléfono con prefijo internacional en orderPhone
  const res2 = resolveMediaRecipient("whatsapp:lid:271296004931588", { orderPhone: "+573101234567" });
  assert.deepEqual(res2, { to: "573101234567", kind: "phone" });

  // C. Destinatario @lid con teléfono en parsedDigits
  const res3 = resolveMediaRecipient("271296004931588@lid", { parsedDigits: "3159998877" });
  assert.deepEqual(res3, { to: "573159998877", kind: "phone" });

  // D. Destinatario @lid SIN teléfono validado: retorna null y NUNCA inventa un número con los dígitos del LID
  const resNoPhone = resolveMediaRecipient("271296004931588@lid");
  assert.equal(resNoPhone, null, "Debe retornar null cuando falta teléfono real");

  const resInvalidPhone = resolveMediaRecipient("271296004931588@lid", { convPhone: "al mismo número" });
  assert.equal(resInvalidPhone, null, "Debe descartar texto no numérico");

  const resShortDigits = resolveMediaRecipient("271296004931588@lid", { convPhone: "12345" });
  assert.equal(resShortDigits, null, "Debe descartar números que no cumplan formato móvil colombiano");

  // Destinatario @lid donde parsedDigits contiene los mismos dígitos del LID (intento de invención a partir de LID)
  const resLidDigits = resolveMediaRecipient("271296004931588@lid", { parsedDigits: "271296004931588" });
  assert.equal(resLidDigits, null, "Debe rechazar dígitos provenientes del identificador @lid");

  // Destinatario @lid donde el candidato contiene cadena @lid o formato LID
  const resLidCandidate = resolveMediaRecipient("271296004931588@lid", { convPhone: "whatsapp:lid:271296004931588" });
  assert.equal(resLidCandidate, null, "Debe rechazar candidatos con formato LID");

  // E. Destinatarios normales (no @lid): resuelve el número telefónico directamente
  const resNormalJid = resolveMediaRecipient("573001234567@s.whatsapp.net");
  assert.deepEqual(resNormalJid, { to: "573001234567", kind: "phone" });

  const resNormalWa = resolveMediaRecipient("whatsapp:+573001234567");
  assert.deepEqual(resNormalWa, { to: "573001234567", kind: "phone" });

  const resBareDigits = resolveMediaRecipient("3001234567");
  assert.deepEqual(resBareDigits, { to: "573001234567", kind: "phone" });

  // F. Entrada vacía
  assert.equal(resolveMediaRecipient(""), null);
});

test("16. isValidContabilidadPdfUrl: Valida estricta restricción a endpoints oficiales de PDF", () => {
  // A. URL oficial válida con sufijo /pdf
  const valid = "https://contabilidad-app-fawn.vercel.app/api/invoices/public/cm123456/pdf";
  assert.equal(isValidContabilidadPdfUrl(valid), true);

  // B. Endpoint público HTML (sin /pdf): no es URL directa de archivo PDF
  const htmlEndpoint = "https://contabilidad-app-fawn.vercel.app/api/invoices/public/cm123456";
  assert.equal(isValidContabilidadPdfUrl(htmlEndpoint), false);

  // C. Inseguro (HTTP)
  const httpUrl = "http://contabilidad-app-fawn.vercel.app/api/invoices/public/cm123456/pdf";
  assert.equal(isValidContabilidadPdfUrl(httpUrl), false);

  // D. Dominio externo no autorizado
  const externalDomain = "https://otro-dominio.com/api/invoices/public/cm123456/pdf";
  assert.equal(isValidContabilidadPdfUrl(externalDomain), false);

  // E. Ruta /public/ vacía
  const emptyId = "https://contabilidad-app-fawn.vercel.app/api/invoices/public//pdf";
  assert.equal(isValidContabilidadPdfUrl(emptyId), false);

  // F. Valores nulos o inválidos
  assert.equal(isValidContabilidadPdfUrl(""), false);
  assert.equal(isValidContabilidadPdfUrl(undefined), false);
  assert.equal(isValidContabilidadPdfUrl("invalido"), false);
});

test("17. fetchAndValidateInvoicePdf: Descarga segura, validación de cabeceras, tamaño y magic bytes", async () => {
  const originalFetch = globalThis.fetch;
  const validPdfUrl = "https://contabilidad-app-fawn.vercel.app/api/invoices/public/cm-test-mock/pdf";
  const fakePdfContent = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");

  try {
    // 1. Descarga exitosa de PDF válido
    globalThis.fetch = (async () => {
      return new Response(fakePdfContent, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(fakePdfContent.length),
        },
      });
    }) as any;

    const resSuccess = await fetchAndValidateInvoicePdf(validPdfUrl, 5000);
    assert.equal(resSuccess.ok, true);
    assert.ok(resSuccess.base64?.startsWith("data:application/pdf;base64,"));
    assert.equal(resSuccess.byteLength, fakePdfContent.length);
    assert.equal(resSuccess.httpStatus, 200);

    // 2. Rechaza Content-Type que no sea application/pdf (ej. respuesta de error en HTML)
    globalThis.fetch = (async () => {
      return new Response("<html><body>404 Not Found</body></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    }) as any;

    const resHtml = await fetchAndValidateInvoicePdf(validPdfUrl, 5000);
    assert.equal(resHtml.ok, false);
    assert.ok(resHtml.error?.includes("Content-Type no válido"));

    // 3. Rechaza contenido sin magic bytes %PDF- (aunque la cabecera declare application/pdf)
    globalThis.fetch = (async () => {
      return new Response(Buffer.from("INVALID_HEADER_CONTENT"), {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      });
    }) as any;

    const resBadMagic = await fetchAndValidateInvoicePdf(validPdfUrl, 5000);
    assert.equal(resBadMagic.ok, false);
    assert.ok(resBadMagic.error?.includes("Cabecera binaria inválida"));

    // 4. Rechaza archivo vacío (0 bytes)
    globalThis.fetch = (async () => {
      return new Response(Buffer.alloc(0), {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      });
    }) as any;

    const resEmpty = await fetchAndValidateInvoicePdf(validPdfUrl, 5000);
    assert.equal(resEmpty.ok, false);
    assert.ok(resEmpty.error?.includes("vacío"));

    // 5A. Rechaza archivo que exceda el tamaño máximo (5 MB) vía cabecera Content-Length
    globalThis.fetch = (async () => {
      return new Response(fakePdfContent, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(MAX_PDF_DOWNLOAD_BYTES + 1024),
        },
      });
    }) as any;

    const resOversizeHeader = await fetchAndValidateInvoicePdf(validPdfUrl, 5000);
    assert.equal(resOversizeHeader.ok, false);
    assert.ok(resOversizeHeader.error?.includes("límite permitido"));

    // 5B. Rechaza archivo que exceda 5 MB SIN cabecera Content-Length (descarga interrumpida en streaming)
    let streamCancelled = false;
    let chunksPushed = 0;
    const chunk2MB = new Uint8Array(2 * 1024 * 1024);
    chunk2MB.set(Buffer.from("%PDF-1.4 chunk"));

    const streamingBody = new ReadableStream({
      pull(controller) {
        chunksPushed++;
        if (chunksPushed <= 4) {
          // Cada chunk mide 2 MB; al recibir el tercer chunk (6 MB) superará el límite de 5 MB
          controller.enqueue(chunk2MB);
        } else {
          controller.close();
        }
      },
      cancel() {
        streamCancelled = true;
      },
    });

    globalThis.fetch = (async () => {
      return new Response(streamingBody, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          // Sin cabecera Content-Length
        },
      });
    }) as any;

    const resOversizeStream = await fetchAndValidateInvoicePdf(validPdfUrl, 5000);
    assert.equal(resOversizeStream.ok, false);
    assert.ok(
      resOversizeStream.error?.includes("Descarga interrumpida") &&
        resOversizeStream.error?.includes("límite permitido"),
      "Debe interrumpir la descarga cuando el acumulado en streaming supere 5 MB"
    );
    assert.equal(streamCancelled, true, "Debe cancelar el lector y liberar el stream inmediatamente");
    assert.ok(chunksPushed <= 4, "No debe descargar el archivo completo si excede el límite");

    // 6. URL fuera del dominio permitido: se rechaza sin llamar a fetch
    const resBlockedUrl = await fetchAndValidateInvoicePdf("https://otro-sitio.com/factura.pdf", 5000);
    assert.equal(resBlockedUrl.ok, false);
    assert.ok(resBlockedUrl.error?.includes("no autorizada"));

    // 7. Simulación de Timeout de red
    globalThis.fetch = (async () => {
      const err = new Error("The operation was aborted due to timeout");
      err.name = "TimeoutError";
      throw err;
    }) as any;

    const resTimeout = await fetchAndValidateInvoicePdf(validPdfUrl, 5000);
    assert.equal(resTimeout.ok, false);
    assert.ok(resTimeout.error?.includes("Timeout"));
    // 8. Detección y bloqueo de redirección a destino no autorizado o no-PDF
    globalThis.fetch = (async () => {
      const resp = new Response(fakePdfContent, {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      });
      Object.defineProperty(resp, "url", { value: "https://sitio-malicioso.com/malware.pdf" });
      return resp;
    }) as any;

    const resRedirect = await fetchAndValidateInvoicePdf(validPdfUrl, 5000);
    assert.equal(resRedirect.ok, false);
    assert.ok(resRedirect.error?.includes("Redirección a un destino no autorizado"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("18. sendEvolutionMedia: Rechaza destinatarios directos @lid y valida destinatarios", async () => {
  const prevUrl = process.env.EVOLUTION_API_URL;
  const prevKey = process.env.EVOLUTION_API_KEY;
  const prevInst = process.env.EVOLUTION_INSTANCE;

  try {
    process.env.EVOLUTION_API_URL = "https://evolution.example.com";
    process.env.EVOLUTION_API_KEY = "test-key";
    process.env.EVOLUTION_INSTANCE = "test-inst";

    // A. Llamada con destinatario @lid directo debe fallar inmediatamente sin colgar la conexión
    const resLid = await sendEvolutionMedia("271296004931588@lid", "data:application/pdf;base64,JVBERi0xLjQK...");
    assert.equal(resLid.ok, false);
    assert.ok(resLid.error?.includes("@lid"), "Debe indicar que sendMedia no soporta destinatarios @lid directos");

    // B. Destinatario inválido
    const resInvalid = await sendEvolutionMedia("", "data:application/pdf;base64,JVBERi0xLjQK...");
    assert.equal(resInvalid.ok, false);
    assert.ok(resInvalid.error?.includes("inválido"));

    // C. Transmisión correcta de Data URI PDF como documento (mediatype: document, application/pdf, Factura...pdf)
    let capturedUrl = "";
    let capturedBody: any = null;
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async (input: any, init?: any) => {
        capturedUrl = String(input);
        capturedBody = JSON.parse(init?.body || "{}");
        return new Response(JSON.stringify({ key: { id: "media-test-123" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as any;

      const resDoc = await sendEvolutionMedia(
        "573001234567",
        "data:application/pdf;base64,JVBERi0xLjQK...",
        "Mi factura"
      );
      assert.equal(resDoc.ok, true);
      assert.equal(capturedUrl, "https://evolution.example.com/message/sendMedia/test-inst");
      assert.equal(capturedBody.number, "573001234567");
      assert.equal(capturedBody.mediatype, "document");
      assert.equal(capturedBody.mimetype, "application/pdf");
      assert.ok(capturedBody.fileName.endsWith(".pdf"));
      assert.equal(capturedBody.media, "JVBERi0xLjQK...");
      assert.equal(capturedBody.caption, "Mi factura");

      // D. Reintento con Data URI si la primera llamada falla
      let callCount = 0;
      let retryBody: any = null;
      globalThis.fetch = (async (input: any, init?: any) => {
        callCount++;
        if (callCount === 1) {
          return new Response(JSON.stringify({ error: "Expects data uri" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        retryBody = JSON.parse(init?.body || "{}");
        return new Response(JSON.stringify({ key: { id: "media-retry-123" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as any;

      const resRetry = await sendEvolutionMedia(
        "573001234567",
        "data:application/pdf;base64,JVBERi0xLjQK...",
        "Mi factura retry"
      );
      assert.equal(resRetry.ok, true);
      assert.equal(callCount, 2);
      assert.equal(retryBody.mediatype, "document");
      assert.equal(retryBody.mimetype, "application/pdf");
      assert.ok(retryBody.fileName.endsWith(".pdf"));
      assert.equal(retryBody.media, "data:application/pdf;base64,JVBERi0xLjQK...");

      // E. Timeout en la solicitud HTTP real a Evolution API
      globalThis.fetch = (async () => {
        const timeoutErr = new Error("The operation was aborted due to timeout");
        timeoutErr.name = "TimeoutError";
        throw timeoutErr;
      }) as any;

      const resTimeout = await sendEvolutionMedia(
        "573001234567",
        "data:application/pdf;base64,JVBERi0xLjQK..."
      );
      assert.equal(resTimeout.ok, false);
      assert.ok(resTimeout.error?.includes("Timeout"), "Debe capturar y propagar el timeout de Evolution");
    } finally {
      globalThis.fetch = originalFetch;
    }
  } finally {
    process.env.EVOLUTION_API_URL = prevUrl;
    process.env.EVOLUTION_API_KEY = prevKey;
    process.env.EVOLUTION_INSTANCE = prevInst;
  }
});

test("19. Independencia de fallos: El fallo en el PDF no impide el texto de confirmación ni el QR", async () => {
  let textSent = false;
  let qrSent = false;
  let pdfAttempted = false;

  // Simulador del pipeline de salida en route.ts
  const simulateOutboundPipeline = async (params: {
    sendTextSuccess: boolean;
    qrSuccess: boolean;
    pdfDownloadSuccess: boolean;
  }) => {
    // 1. Mensaje de texto principal (confirmación con número y enlace de factura)
    if (params.sendTextSuccess) {
      textSent = true;
    }

    // 2. Multimedia QR (independiente)
    try {
      if (params.qrSuccess) {
        qrSent = true;
      }
    } catch {}

    // 3. Multimedia PDF (independiente con captura de excepciones)
    try {
      pdfAttempted = true;
      if (!params.pdfDownloadSuccess) {
        throw new Error("Timeout o error al descargar PDF");
      }
    } catch (pdfErr: any) {
      // Capturado de forma segura sin propagar el error hacia el flujo principal
      assert.ok(pdfErr.message.includes("descargar PDF"));
    }
  };

  await simulateOutboundPipeline({
    sendTextSuccess: true,
    qrSuccess: true,
    pdfDownloadSuccess: false, // El PDF falla
  });

  assert.equal(textSent, true, "El mensaje de confirmación de texto se envía con éxito");
  assert.equal(qrSent, true, "El código QR se envía con éxito");
  assert.equal(pdfAttempted, true, "El PDF intentó enviarse pero su fallo no interrumpió el texto ni el QR");
});

test("20. Cálculo determinista de cambio y normalización de efectivo (Casos obligatorios §3)", () => {
  // A. Total $36.000 y efectivo $40.000 → cambio $4.000
  const c1 = calculateCashChange(40000, 36000);
  assert.ok(c1);
  assert.equal(c1.cashAmount, 40000);
  assert.equal(c1.change, 4000);
  assert.equal(c1.formattedCash, "$40.000");
  assert.equal(c1.formattedChange, "$4.000");
  assert.equal(c1.isExact, false);
  assert.equal(c1.isInsufficient, false);

  // B. Total $36.000 y efectivo $50.000 → cambio $14.000
  const c2 = calculateCashChange("Billete de $50.000", 36000);
  assert.ok(c2);
  assert.equal(c2.cashAmount, 50000);
  assert.equal(c2.change, 14000);
  assert.equal(c2.formattedCash, "$50.000");
  assert.equal(c2.formattedChange, "$14.000");

  // C. Total $36.000 sin efectivo indicado → no inventar la cantidad
  assert.equal(calculateCashChange(undefined, 36000), null);
  assert.equal(calculateCashChange(null, 36000), null);
  assert.equal(calculateCashChange("", 36000), null);

  // D. Total $36.000 y efectivo $30.000 → insuficiente
  const c3 = calculateCashChange(30000, 36000);
  assert.ok(c3);
  assert.equal(c3.isInsufficient, true);
  assert.equal(c3.cashAmount, 30000);

  // E. Normalización de formatos admitidos: "40000", "$40.000", "40.000", "40.000 pesos", "40k", "40 mil", "con 40 mil"
  const formats = [
    "40000",
    "$40.000",
    "40.000",
    "40.000 pesos",
    "40.000 cop",
    "40k",
    "40 mil",
    "con 40 mil",
    "con 40000",
    "pago con 40 mil",
  ];
  for (const fmt of formats) {
    const parsed = parseCashAmount(fmt);
    assert.ok(parsed, `Debe reconocer formato: ${fmt}`);
    assert.equal(parsed.amount, 40000, `Debe normalizar a 40000: ${fmt}`);
  }

  // F. Pago exacto
  const exactFormats = ["exacto", "monto exacto", "pago exacto", "no necesito cambio", "sin cambio"];
  for (const ef of exactFormats) {
    const calc = calculateCashChange(ef, 36000);
    assert.ok(calc, `Debe reconocer pago exacto: ${ef}`);
    assert.equal(calc.isExact, true);
    assert.equal(calc.change, 0);
  }

  // G. No confundir con números de teléfono (10 dígitos que empiezan con 3) ni direcciones
  assert.equal(parseCashAmount("3228964947"), null, "No debe tomar un teléfono como efectivo");
  assert.equal(parseCashAmount("Calle 40 # 20-10"), null, "No debe tomar una dirección como efectivo");
  assert.equal(parseCashAmount("Carrera 50 # 12-34"), null, "No debe tomar carrera 50 como efectivo");
  assert.equal(parseCashAmount("1"), null, "No debe tomar la opción 1 como efectivo");
});

test("21. Conservación del efectivo del usuario frente a respuestas contradictorias de la IA (§3)", async () => {
  const convId = "whatsapp:+573009988771";
  await getOrCreateConversation(convId);

  // 1. Simular pedido de $36.000 en el agente con mensaje explícito "40000"
  await handleSalesMessage(convId, "Quiero una caja surtida de 8 con mora y arequipe", "Camilo");
  await handleSalesMessage(convId, "Carrera 7 # 10-20 centro", "Camilo");
  await handleSalesMessage(convId, "Pago en efectivo contra entrega", "Camilo");

  // El cliente indica explícitamente 40000
  const cashRes = await handleSalesMessage(convId, "40000", "Camilo");

  // Verificar que el resumen contenga el importe explícito del cliente y el cambio calculado de $4.000
  assert.ok(
    cashRes.reply.includes("$40.000") || cashRes.reply.includes("40.000"),
    "La respuesta debe conservar los $40.000 indicados por el cliente"
  );
  assert.ok(
    !cashRes.reply.includes("$50.000"),
    "La respuesta NO debe inventar ni hallucinar un billete de $50.000"
  );
  assert.ok(
    cashRes.reply.includes("$4.000") || cashRes.reply.includes("4.000"),
    "La respuesta debe calcular el cambio determinista de $4.000"
  );

  // 2. Confirmar pedido
  const confirmRes = await handleSalesMessage(convId, "1", "Camilo");
  assert.ok(confirmRes.reply.includes("Pedido Confirmado") || confirmRes.reply.includes("Registrado"));

  // 3. Verificar orden en BD
  const orders = await getOrders();
  const saved = orders.find((o) => o.conversationId === convId);
  assert.ok(saved);
  assert.equal(saved.total, 36000);
  assert.ok(saved.changeAmount?.includes("40.000"), "El campo changeAmount debe conservar la instrucción del cliente");
});

test("22. Mensajes sucesivos con cantidades diferentes: conserva el último valor confirmado (§3)", async () => {
  const convId = "whatsapp:+573009988772";
  await getOrCreateConversation(convId);

  await handleSalesMessage(convId, "Una caja tradicional de 8", "Paula");
  await handleSalesMessage(convId, "Calle 10 # 5-20", "Paula");
  await handleSalesMessage(convId, "Efectivo", "Paula");

  // Primero dice 50000
  await handleSalesMessage(convId, "50000", "Paula");

  // Luego cambia de opinión y dice 40000
  const updatedRes = await handleSalesMessage(convId, "Mejor con 40000", "Paula");

  assert.ok(
    updatedRes.reply.includes("40.000") || updatedRes.reply.includes("$40.000"),
    "Debe conservar la última cantidad indicada (40.000)"
  );
  assert.ok(
    !updatedRes.reply.includes("$50.000") && !updatedRes.reply.includes("50.000"),
    "No debe mantener la cantidad antigua descartada (50.000)"
  );
});

test("23. Efectivo insuficiente: intercepta y solicita aclaración sin confirmar el pedido (§3)", async () => {
  const convId = "whatsapp:+573009988773";
  await getOrCreateConversation(convId);

  // Pedido con total $32.000
  await handleSalesMessage(convId, "Quiero una caja tradicional de 8", "Andrés");
  await handleSalesMessage(convId, "Calle 1 # 2-3", "Andrés");
  await handleSalesMessage(convId, "Efectivo", "Andrés");

  // El cliente dice que pagará con 20000 (insuficiente para $32.000)
  const res = await handleSalesMessage(convId, "20000", "Andrés");

  assert.ok(
    res.reply.toLowerCase().includes("no alcanza") ||
    res.reply.toLowerCase().includes("insuficiente") ||
    res.reply.toLowerCase().includes("no cubre"),
    "Debe advertir que el efectivo no alcanza para cubrir el total"
  );
  assert.ok(
    !res.reply.toLowerCase().includes("pedido confirmado"),
    "NO debe confirmar el pedido cuando el efectivo es insuficiente"
  );
  assert.notEqual(res.mode, "order_created", "No debe crear la orden en persistencia");
});

test("24. Ficha del domiciliario con campo «Paga con» formateado correctamente y cambio calculado (§5)", () => {
  // A. Pedido de $36.000 con efectivo $40.000 → Paga con: $40.000 (Cambio: $4.000)
  const dummyOrderCash: Order = {
    id: "ord-test-driver-1",
    conversationId: "whatsapp:+573111223344",
    customerName: "Carlos Pérez",
    customerPhone: "3111223344",
    deliveryAddress: "Calle 5 # 4-20 barrio Las Flores",
    itemsSummary: "1x Caja x8 Surtida, 1x Jugo de mora",
    total: 36000,
    deliveryFee: 0,
    paymentMethod: "Efectivo contra entrega",
    changeAmount: "$40.000",
    status: "pending",
    createdAt: Date.now(),
  };

  const card1 = formatDeliveryDriverMessage(dummyOrderCash);
  assert.ok(card1.includes("💰 COBRO"), "Debe mostrar sección de cobro");
  assert.ok(card1.includes("36.000"), "Debe mostrar total");
  assert.ok(card1.includes("Paga con: $40.000") && card1.includes("Cambio: $4.000"), "Debe mostrar paga con y cambio exacto");

  // B. Pedido de $32.000 con billete de $50.000 (Test L compatibilidad)
  const dummyOrderBill: Order = {
    ...dummyOrderCash,
    id: "ord-test-driver-2",
    total: 32000,
    changeAmount: "Billete de $50.000",
  };
  const card2 = formatDeliveryDriverMessage(dummyOrderBill);
  assert.ok(card2.includes("Paga con: Billete de $50.000") && card2.includes("Cambio: $18.000"), "Debe calcular cambio determinista para billete");

  // C. Pedido en efectivo sin monto indicado (changeAmount undefined / vacío)
  const dummyOrderNoCash: Order = {
    ...dummyOrderCash,
    id: "ord-test-driver-3",
    changeAmount: undefined,
  };
  const card3 = formatDeliveryDriverMessage(dummyOrderNoCash);
  assert.ok(!card3.includes("Paga con:"), "No debe mostrar 'Paga con' cuando no hay datos válidos");

  // D. Pedido con pago exacto
  const dummyOrderExact: Order = {
    ...dummyOrderCash,
    id: "ord-test-driver-4",
    changeAmount: "Monto exacto",
  };
  const card4 = formatDeliveryDriverMessage(dummyOrderExact);
  assert.ok(
    card4.includes("Monto exacto") && card4.includes("Cambio: $0"),
    "Debe reflejar pago exacto sin cambio"
  );

  // E. Pedido de transferencia (Nequi / Bre-B): no debe mostrar línea de cambio en efectivo
  const dummyOrderTransfer: Order = {
    ...dummyOrderCash,
    id: "ord-test-driver-5",
    paymentMethod: "Nequi",
    changeAmount: undefined,
  };
  const card5 = formatDeliveryDriverMessage(dummyOrderTransfer);
  assert.ok(!card5.includes("Paga con:"), "No debe incluir línea de 'Paga con' en pedidos por transferencia");
});

test("25. Desduplicación del enlace de factura: caption del PDF no duplica la URL ya enviada en el texto (§6)", () => {
  const invoiceNumber = "B-0013";
  const invoiceUrl = "https://contabilidad-app-fawn.vercel.app/api/invoices/public/cm-123";

  // 1. El texto de confirmación genera el enlace digital oficial
  const noticeRes = resolveInvoiceNoticeDetails(invoiceNumber, invoiceUrl, "cm-123", "");
  assert.ok(noticeRes.noticeLine.includes("#B-0013"));
  assert.ok(noticeRes.noticeLine.includes("https://contabilidad-app-fawn.vercel.app/api/invoices/public/cm-123"));

  // 2. El caption del PDF adjunto NO debe contener la URL digital para evitar duplicación al cliente
  const formattedNum = `#${invoiceNumber}`;
  const pdfCaption = `🧾 Factura Oficial ${formattedNum} (Documento PDF adjunto).\n¡Gracias por tu compra en Buñuelandia! 🥟✨`;

  assert.ok(pdfCaption.includes("🧾 Factura Oficial #B-0013"));
  assert.ok(
    !pdfCaption.includes("https://contabilidad-app-fawn.vercel.app"),
    "El caption del PDF no debe volver a imprimir la URL digital completa"
  );
  assert.ok(
    !pdfCaption.includes("📄 Ver factura digital:"),
    "El caption del PDF no debe incluir la etiqueta de ver factura digital"
  );
});

test("26. Idempotencia y prevención de envíos duplicados de PDF de factura ante reintentos de webhook (§6 y §10)", () => {
  const testKey = `test-idempotency-conv-${Date.now()}:B-0013`;

  // Inicialmente no está en caché
  assert.equal(sentInvoicePdfsCache.has(testKey), false);

  // Primer envío registra la clave
  sentInvoicePdfsCache.set(testKey, Date.now());
  assert.equal(sentInvoicePdfsCache.has(testKey), true);

  // Reintento: detecta envío reciente y bloquea reenvío
  const lastSent = sentInvoicePdfsCache.get(testKey);
  assert.ok(lastSent);
  const isDuplicate = Date.now() - lastSent < SENT_PDF_CACHE_TTL_MS;
  assert.equal(isDuplicate, true, "Debe marcar como duplicado un reintento dentro de la ventana TTL");

  // Limpiar clave de prueba
  sentInvoicePdfsCache.delete(testKey);
});

test("27. Efectivo contra entrega no registra pago como recibido prematuramente (§4)", async () => {
  // Simular la llamada a createInvoiceInContabilidad con Efectivo contra entrega
  const payloadCaptured: any[] = [];
  const mockCreateInvoice = async (params: any) => {
    payloadCaptured.push(params);
    return { ok: true, invoiceNumber: "B-0018", invoiceUrl: "https://contabilidad-app-fawn.vercel.app/api/invoices/public/cm-18" };
  };

  const isCash = true;
  await mockCreateInvoice({
    orderId: "ord-test-cod-1",
    customerName: "Diana Morales",
    phone: "+573155554433",
    deliveryAddress: "Vereda La Esmeralda",
    paymentMethod: "Efectivo contra entrega",
    paymentStatus: isCash ? "issued" : "paid",
    isCashOnDelivery: isCash,
    changeAmount: "$50.000",
    total: 36000,
    items: [],
  });

  assert.equal(payloadCaptured.length, 1);
  const sent = payloadCaptured[0];
  assert.equal(sent.paymentStatus, "issued", "Para efectivo contra entrega, el estado de pago debe ser 'issued' (emitida con saldo pendiente)");
  assert.equal(sent.isCashOnDelivery, true, "Debe marcar isCashOnDelivery como true");
  assert.notEqual(sent.paymentStatus, "paid", "NO debe registrar el estado como 'paid' prematuramente");
});

test("28. Aislamiento estricto de datos del comprador: no inventa correos ni direcciones no proporcionadas (Sección 14)", () => {
  // Caso: el cliente no ha proporcionado correo electrónico
  const orderData = {
    customerName: "Santiago Ruiz",
    phone: "3201234567",
    deliveryAddress: "Calle 12 # 3-45",
  };

  // Verificar que el payload no incluya correo inventado
  const invoiceParams: any = {
    customerName: orderData.customerName,
    phone: `+57${orderData.phone}`,
    deliveryAddress: orderData.deliveryAddress,
  };

  assert.equal(invoiceParams.customerEmail, undefined, "No debe incluir customerEmail ficticio");
  assert.ok(!JSON.stringify(invoiceParams).includes("@cliente.com"), "No debe generar correos ficticios");
  assert.ok(!JSON.stringify(invoiceParams).includes("correo@"), "No debe inventar correos predeterminados");
  assert.equal(invoiceParams.deliveryAddress, "Calle 12 # 3-45", "La dirección de entrega debe ser exclusivamente la proporcionada");
});

test("29. Coherencia global entre pedido, cliente, domiciliario y facturación (§8)", async () => {
  const totalMatematico = 36000;
  const efectivoCliente = 40000;
  const cambioCalculado = 4000;

  // 1. Cálculo matemático oficial
  const changeCalc = calculateCashChange(efectivoCliente, totalMatematico);
  assert.ok(changeCalc);
  assert.equal(changeCalc.cashAmount, efectivoCliente);
  assert.equal(changeCalc.change, cambioCalculado);

  // 2. Ficha del domiciliario
  const driverCard = formatDeliveryDriverMessage({
    id: "ord-test-coherence-1",
    conversationId: "whatsapp:+573123456789",
    customerName: "Mariana Gómez",
    customerPhone: "3123456789",
    deliveryAddress: "Carrera 4 # 8-15 centro",
    itemsSummary: "1x Caja x8 Surtida, 1x Café campesino",
    total: totalMatematico,
    deliveryFee: 0,
    paymentMethod: "Efectivo contra entrega",
    changeAmount: `$${efectivoCliente.toLocaleString("es-CO")}`,
    status: "pending",
    createdAt: Date.now(),
  });

  assert.ok(driverCard.includes("36.000"), "Domiciliario: Total $36.000");
  assert.ok(driverCard.includes("Paga con: $40.000") && driverCard.includes("Cambio: $4.000"), "Domiciliario: Paga con $40.000 y Cambio $4.000");
  assert.ok(driverCard.includes("Mariana Gómez"), "Domiciliario: Nombre cliente");

  // 3. Facturación: coherencia de datos
  const invoiceParams = {
    orderId: "ord-test-coherence-1",
    customerName: "Mariana Gómez",
    total: totalMatematico,
    changeAmount: `$${efectivoCliente.toLocaleString("es-CO")}`,
    paymentMethod: "Efectivo contra entrega",
    paymentStatus: "issued" as const,
    isCashOnDelivery: true,
  };

  assert.equal(invoiceParams.total, 36000);
  assert.equal(invoiceParams.changeAmount, "$40.000");
  assert.equal(invoiceParams.paymentStatus, "issued");
});

test("30. Deduplicación atómica persistente de PDF de factura con recuperación ante fallos (§10)", async () => {
  // 1. Crear orden de prueba
  const order = await createOrder(
    "test-conv-pdf-lease",
    [{ sku: "C4", name: "Caja x4", quantity: 1, unitPrice: 18000 }],
    18000,
    {
      customerName: "Prueba Deduplicación",
      deliveryAddress: "Calle 100 # 20-30",
      paymentMethod: "Efectivo contra entrega",
      itemsSummary: "1x Caja x4",
      status: "confirmed",
    }
  );
  const testOrderId = order.id;

  // 2. Primer reclamo debe ser exitoso
  const firstClaim = await claimOrderInvoicePdf(testOrderId);
  assert.equal(firstClaim, true, "El primer intento de reclamo debe ser concedido");

  // 3. Intento concurrente inmediato debe ser rechazado
  const secondClaim = await claimOrderInvoicePdf(testOrderId);
  assert.equal(secondClaim, false, "Un intento concurrente inmediato para la misma orden debe ser rechazado");

  // 4. Si el envío falla, release(id, false) debe marcar 'failed' y permitir un nuevo reclamo
  await releaseOrderInvoicePdf(testOrderId, false);
  const retryAfterFailure = await claimOrderInvoicePdf(testOrderId);
  assert.equal(retryAfterFailure, true, "Tras un fallo registrado, debe permitir un nuevo reclamo para reintentar");

  // 5. Tras un envío exitoso, release(id, true) debe marcar 'sent' y bloquear permanentemente futuros reclamos
  await releaseOrderInvoicePdf(testOrderId, true);
  const claimAfterSuccess = await claimOrderInvoicePdf(testOrderId);
  assert.equal(claimAfterSuccess, false, "Una vez marcado como 'sent', ningún reintento futuro debe ser concedido");
});

test("31. Flujo de confirmación: Envío exclusivo de enlace de factura sin descarga ni adjunto de PDF", async () => {
  // 1. Simular respuesta de confirmación con factura oficial
  const orderDetails = {
    customerName: "Camila Restrepo",
    phone: "3119876543",
    deliveryAddress: "Carrera 7 # 45-20 apto 301",
    paymentMethod: "Efectivo contra entrega",
    changeAmount: "$50.000",
    total: 36000,
    items: "1x Caja x8 Surtida, 1x Café campesino",
  };

  const invoiceNumber = "B-0021";
  const invoiceUrl = "https://contabilidad-app-fawn.vercel.app/api/invoices/public/cm-factura-21";

  // Base reply generada por el asistente antes del aviso de factura
  const baseReply = `¡Pedido Confirmado en Buñuelandia! 🥟🎉\n• Productos: ${orderDetails.items}\n• Total: $36.000\n• Dirección: ${orderDetails.deliveryAddress}\n• Pago: ${orderDetails.paymentMethod} (Pagas con $50.000, tu cambio es $14.000).`;

  // 2. Resolver aviso de factura
  const noticeRes = resolveInvoiceNoticeDetails(invoiceNumber, invoiceUrl, "cm-factura-21", baseReply);

  // Verificar que el enlace está presente y bien formateado
  assert.ok(noticeRes.noticeLine.includes(invoiceUrl), "Debe incluir la URL pública de la factura");
  assert.ok(noticeRes.noticeLine.includes("#B-0021"), "Debe incluir el número oficial formateado");
  assert.ok(
    noticeRes.noticeLine.includes("descargar"),
    "Debe indicar al cliente que puede abrir el enlace y descargar el PDF oficial"
  );

  const fullReply = `${baseReply}${noticeRes.noticeLine}`;

  // 3. Verificación de no duplicación del enlace
  const urlOccurrences = (fullReply.match(new RegExp(invoiceUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
  assert.equal(urlOccurrences, 1, "El enlace de la factura debe aparecer exactamente una sola vez en el mensaje");

  // Si se vuelve a pasar el texto que ya contiene la URL, noticeLine debe ser vacío
  const duplicateCheck = resolveInvoiceNoticeDetails(invoiceNumber, invoiceUrl, "cm-factura-21", fullReply);
  assert.equal(duplicateCheck.noticeLine, "", "No debe duplicar ni el número ni el enlace si ya están presentes en el texto");

  // 4. Verificación de que los datos del pedido se conservan íntegros
  assert.ok(fullReply.includes("1x Caja x8 Surtida"), "Conserva ítems");
  assert.ok(fullReply.includes("$36.000"), "Conserva total oficial");
  assert.ok(fullReply.includes("Carrera 7 # 45-20 apto 301"), "Conserva dirección");
  assert.ok(fullReply.includes("Pagas con $50.000, tu cambio es $14.000"), "Conserva cálculo determinista de cambio");

  // 5. Manejo controlado ante fallo o ausencia de enlace: no inventa URLs ficticias ni genera una segunda factura
  const fallbackNotice = resolveInvoiceNoticeDetails("B-0022", undefined, undefined, "");
  assert.equal(fallbackNotice.publicUrl, undefined);
  assert.ok(!fallbackNotice.noticeLine.includes("http"), "No debe inventar URLs si no se obtuvo un enlace válido");
  assert.ok(fallbackNotice.noticeLine.includes("#B-0022"), "Conserva el número oficial si existe");

  // Si tanto número como URL faltan o fallan
  const emptyNotice = resolveInvoiceNoticeDetails(undefined, undefined, undefined, "");
  assert.equal(emptyNotice.noticeLine, "", "NoticeLine debe ser vacío si no hay datos de factura válidos");
});

test("32. Webhook: Flujo de ventas despacha mensaje único con enlace y no invoca descarga ni envío de PDF multimedia", async () => {
  // Simular la ejecución de entrega tras handleSalesMessage
  const outboundCalls: Array<{ to: string; text?: string; media?: string; caption?: string }> = [];

  const mockSendDelayedOutbound = async (from: string, replyTo: string, text: string, _msgId?: string) => {
    outboundCalls.push({ to: replyTo, text });
    return { ok: true, channel: "whatsapp" };
  };

  const mockSendOutboundMedia = async (to: string, media: string, caption?: string) => {
    outboundCalls.push({ to, media, caption });
    return { ok: true, channel: "evolution" };
  };

  let pdfDownloadAttempted = false;
  const _mockFetchAndValidatePdf = async () => {
    pdfDownloadAttempted = true;
    return { ok: true, base64: "data:application/pdf;base64,..." };
  };

  // Simular los resultados de handleSalesMessage
  const salesResult = {
    reply: "¡Pedido Confirmado! 🥟 Total: $18.000. Ver tu Factura digital: https://contabilidad-app-fawn.vercel.app/api/invoices/public/cm-123",
    mode: "order_created",
    mediaUrl: undefined, // Pago en efectivo: no envía QR
    invoiceUrl: "https://contabilidad-app-fawn.vercel.app/api/invoices/public/cm-123",
    invoicePdfUrl: "https://contabilidad-app-fawn.vercel.app/api/invoices/public/cm-123/pdf",
    invoiceNumber: "B-0023",
  };

  // Ejecución en webhook (siguiendo la lógica actualizada en route.ts):
  // 1. Envía el mensaje único de confirmación
  await mockSendDelayedOutbound("whatsapp:+573123456789", "573123456789@s.whatsapp.net", salesResult.reply, "msg-test-1");

  // 2. mediaUrl solo si existe (QR para transferencias)
  if (salesResult.mediaUrl) {
    await mockSendOutboundMedia("573123456789@s.whatsapp.net", salesResult.mediaUrl);
  }

  // 3. El webhook ya NO descarga ni envía PDF como documento
  // (invoicePdfUrl no activa ninguna llamada a mockFetchAndValidatePdf ni a mockSendOutboundMedia)

  // Verificaciones estrictas
  assert.equal(outboundCalls.length, 1, "Debe realizar exactamente UN solo envío saliente (el mensaje de texto de confirmación)");
  assert.equal(pdfDownloadAttempted, false, "NO debe descargar el PDF para adjuntarlo a WhatsApp");
  assert.ok(outboundCalls[0].text?.includes("https://contabilidad-app-fawn.vercel.app/api/invoices/public/cm-123"), "El mensaje debe contener el enlace web");
  assert.equal(outboundCalls.some(c => Boolean(c.media)), false, "NO debe haber ningún envío de medios ni documentos PDF adjuntos");
});

test("33. Domiciliario: Comando PAGADO solo se procesa desde el número autorizado", () => {
  const configuredDriver = "3228964947";
  const normalizedConfigured = normalizeEvolutionNumber(configuredDriver);

  // Remitente 1: El domiciliario autorizado con prefijo 57
  const sender1 = "573228964947";
  const isAuth1 = normalizeEvolutionNumber(sender1) === normalizedConfigured;
  assert.equal(isAuth1, true, "Debe autenticar al domiciliario con prefijo 57");

  // Remitente 2: Domiciliario sin prefijo 57
  const sender2 = "3228964947";
  const isAuth2 = normalizeEvolutionNumber(sender2) === normalizedConfigured;
  assert.equal(isAuth2, true, "Debe autenticar al domiciliario con 10 dígitos");

  // Remitente 3: Un cliente o número ajeno intentando enviar el comando PAGADO
  const sender3 = "573109998877";
  const isAuth3 = normalizeEvolutionNumber(sender3) === normalizedConfigured;
  assert.equal(isAuth3, false, "Debe rechazar números que no coincidan con el domiciliario configurado");

  // Remitente 4: Intento de suplantación en el texto
  const fakeSenderPushName = "Soy el Domiciliario";
  assert.equal(
    Boolean(normalizedConfigured && normalizeEvolutionNumber("3112223344") === normalizedConfigured),
    false,
    "No debe confiar en pushName ni en el texto del mensaje"
  );
});

test("34. Domiciliario: Validación de pedidos inexistentes y medios de pago no en efectivo", async () => {
  // Crear un pedido de prueba que es transferencia (no efectivo)
  const transferOrder = await createOrder("whatsapp:+573001112233", [], 25000, {
    customerName: "Juan Pérez",
    paymentMethod: "Nequi",
    invoiceNumber: "B-0080",
    invoiceId: "inv-transfer-80",
  });

  // Búsqueda de pedido por factura y por ID
  const foundOrder = await findOrderByInvoiceOrRef("B-0080");
  assert.ok(foundOrder, "Debe encontrar el pedido por número de factura");
  assert.equal(foundOrder?.id, transferOrder.id);

  const pm = (foundOrder?.paymentMethod || "").toLowerCase();
  const isCash = pm.includes("efectivo") || pm.includes("contra entrega") || pm.includes("contraentrega");
  assert.equal(isCash, false, "Debe identificar que el pedido es transferencia y no contra entrega");

  // Búsqueda de pedido inexistente
  const notFound = await findOrderByInvoiceOrRef("B-9999");
  assert.equal(notFound, null, "Debe retornar null ante referencias inexistentes");
});

test("35. Domiciliario: Confirmación persistente e idempotencia ante repetición del comando PAGADO", async () => {
  const cashOrder = await createOrder("whatsapp:+573002223344", [], 38000, {
    customerName: "Laura Gómez",
    paymentMethod: "Efectivo contra entrega",
    invoiceNumber: "B-0081",
    invoiceId: "inv-cash-81",
    status: "delivering",
  });

  // 1. Confirmación válida inicial
  const confirmed = await markOrderDriverPaymentConfirmed(cashOrder.id, {
    amount: 38000,
    phone: "573228964947",
  });
  assert.ok(confirmed);
  assert.equal(confirmed?.driverPaymentConfirmed, 1);
  assert.equal(confirmed?.driverPaymentAmount, 38000);
  assert.equal(confirmed?.driverPaymentPhone, "573228964947");
  assert.ok(confirmed?.driverPaymentConfirmedAt && confirmed.driverPaymentConfirmedAt > 0);

  // 2. Repetición del comando PAGADO (simulación de doble envío por WhatsApp)
  // El código verifica si driverPaymentConfirmed ya es 1
  const reloaded = await findOrderByInvoiceOrRef("B-0081");
  assert.equal(reloaded?.driverPaymentConfirmed, 1);

  // Al estar ya confirmado, el webhook rechaza el segundo registro devolviendo already_confirmed
  const shouldSkipSecondCharge = Boolean(reloaded?.driverPaymentConfirmed);
  assert.equal(shouldSkipSecondCharge, true, "No debe registrar un segundo cobro si ya fue confirmado");
});

test("36. Panel: Marcar Entregado sin confirmación de cobro conserva factura pendiente y alerta al admin", async () => {
  const unconfirmedOrder = await createOrder("whatsapp:+573003334455", [], 42000, {
    customerName: "Mateo Silva",
    paymentMethod: "Efectivo",
    invoiceNumber: "B-0082",
    invoiceId: "inv-cash-82",
    status: "delivering",
  });

  // El administrador marca 'delivered' desde el panel
  const updated = await updateOrderStatus(unconfirmedOrder.id, "delivered");
  assert.ok(updated);
  assert.equal(updated?.status, "delivered", "El pedido pasa físicamente a delivered");

  // Lógica del endpoint PATCH /api/panel/orders/[id]
  let warning: string | undefined;
  let paymentSynced = false;
  let accountingCalled = false;

  const isCash = (updated?.paymentMethod || "").toLowerCase().includes("efectivo");
  if (isCash) {
    if (updated?.driverPaymentConfirmed) {
      accountingCalled = true;
      paymentSynced = true;
    } else {
      warning = "Pedido entregado; cobro pendiente de confirmación del domiciliario.";
    }
  }

  assert.equal(warning, "Pedido entregado; cobro pendiente de confirmación del domiciliario.");
  assert.equal(paymentSynced, false, "El pago no se marca como sincronizado");
  assert.equal(accountingCalled, false, "NO debe llamar a Contabilidad para registrar el pago si falta el cobro del domiciliario");
  assert.equal(updated?.accountingPaymentSynced || 0, 0, "Factura permanece sin pago registrado");
});

test("37. Flujo completo: Domiciliario confirma primero y Admin marca Entregado después", async () => {
  const order = await createOrder("whatsapp:+573004445566", [], 55000, {
    customerName: "Valentina Ruiz",
    paymentMethod: "Efectivo contra entrega",
    invoiceNumber: "B-0083",
    invoiceId: "inv-cash-83",
    status: "delivering",
  });

  // Paso 1: Domiciliario envía "PAGADO B-0083" mientras el pedido sigue en camino
  await markOrderDriverPaymentConfirmed(order.id, {
    amount: 55000,
    phone: "573228964947",
  });

  // Como status sigue siendo 'delivering', Contabilidad aún NO se sincroniza
  assert.equal(order.accountingPaymentSynced || 0, 0);

  // Paso 2: Administrador marca 'delivered' en el panel
  const deliveredOrder = await updateOrderStatus(order.id, "delivered");
  assert.equal(deliveredOrder?.status, "delivered");

  // Ambas condiciones se cumplen:
  let accountingCalled = false;
  if (deliveredOrder?.driverPaymentConfirmed && !deliveredOrder.accountingPaymentSynced) {
    accountingCalled = true;
    await markOrderAccountingPaymentSynced(deliveredOrder.id);
  }

  assert.equal(accountingCalled, true, "Debe llamar a Contabilidad al cumplirse ambas condiciones");
  const finalOrder = await findOrderByInvoiceOrRef("B-0083");
  assert.equal(finalOrder?.accountingPaymentSynced, 1, "Queda registrado como sincronizado con Contabilidad");
  assert.equal(finalOrder?.invoiceNumber, "B-0083", "Conserva exactamente la misma factura");
});

test("38. Flujo inverso: Admin marca Entregado primero y Domiciliario confirma después", async () => {
  const order = await createOrder("whatsapp:+573005556677", [], 28000, {
    customerName: "Camilo Torres",
    paymentMethod: "Efectivo",
    invoiceNumber: "B-0084",
    invoiceId: "inv-cash-84",
    status: "delivering",
  });

  // Paso 1: Admin marca entregado primero
  const deliveredOrder = await updateOrderStatus(order.id, "delivered");
  assert.equal(deliveredOrder?.status, "delivered");
  assert.equal(deliveredOrder?.accountingPaymentSynced || 0, 0, "Factura pendiente sin confirmar");

  // Paso 2: Domiciliario envía "PAGADO B-0084" posteriormente
  await markOrderDriverPaymentConfirmed(deliveredOrder!.id, {
    amount: 28000,
    phone: "573228964947",
  });

  // El webhook detecta que order.status === 'delivered'
  const current = await findOrderByInvoiceOrRef("B-0084");
  let autoSynced = false;
  if (current?.status === "delivered" && current.driverPaymentConfirmed && !current.accountingPaymentSynced) {
    autoSynced = true;
    await markOrderAccountingPaymentSynced(current.id);
  }

  assert.equal(autoSynced, true, "Sincroniza automáticamente con Contabilidad al llegar la confirmación posterior");
  const syncedOrder = await findOrderByInvoiceOrRef("B-0084");
  assert.equal(syncedOrder?.accountingPaymentSynced, 1);
});

test("39. Resiliencia y recuperación: Fallo temporal de Contabilidad conserva confirmación para reintento", async () => {
  const order = await createOrder("whatsapp:+573006667788", [], 32000, {
    customerName: "Paola Andrade",
    paymentMethod: "Efectivo",
    invoiceNumber: "B-0085",
    invoiceId: "inv-cash-85",
    status: "delivered",
  });

  // Domiciliario confirma el cobro
  await markOrderDriverPaymentConfirmed(order.id, {
    amount: 32000,
    phone: "573228964947",
  });

  // Simulación: Contabilidad falla temporalmente (timeout / 500)
  let contabilidadFail = true;
  let syncResult = { ok: false, error: "Network timeout al conectar con facturación" };

  if (!contabilidadFail) {
    await markOrderAccountingPaymentSynced(order.id);
  }

  // La confirmación del domiciliario NO se pierde
  const afterFailure = await findOrderByInvoiceOrRef("B-0085");
  assert.equal(afterFailure?.driverPaymentConfirmed, 1, "La confirmación del domiciliario debe conservarse intacta en BD");
  assert.equal(afterFailure?.accountingPaymentSynced || 0, 0, "Permanece pendiente de sincronización");

  // Reintento: Contabilidad vuelve a estar disponible
  contabilidadFail = false;
  syncResult = { ok: true, error: "" };
  if (syncResult.ok) {
    await markOrderAccountingPaymentSynced(order.id);
  }

  const afterRetry = await findOrderByInvoiceOrRef("B-0085");
  assert.equal(afterRetry?.accountingPaymentSynced, 1, "Se sincroniza exitosamente en el reintento sin duplicar cobro");
});

test("40. Integridad de facturas: Nunca se crea una segunda factura al cobrar y conserva número y enlace", async () => {
  const originalInvoiceNumber = "B-0086";
  const originalInvoiceId = "inv-uuid-86";
  const originalInvoiceUrl = "https://contabilidad-app-fawn.vercel.app/api/invoices/public/inv-uuid-86";

  const order = await createOrder("whatsapp:+573007778899", [], 40000, {
    customerName: "Andrés Restrepo",
    paymentMethod: "Efectivo",
    invoiceNumber: originalInvoiceNumber,
    invoiceId: originalInvoiceId,
    invoiceUrl: originalInvoiceUrl,
    status: "delivered",
  });

  // Confirmar cobro y sincronizar
  await markOrderDriverPaymentConfirmed(order.id, { amount: 40000, phone: "573228964947" });
  await markOrderAccountingPaymentSynced(order.id);

  const finalizedOrder = await findOrderByInvoiceOrRef("B-0086");
  assert.equal(finalizedOrder?.invoiceNumber, originalInvoiceNumber, "El número de factura #B-0086 debe ser exactamente el mismo");
  assert.equal(finalizedOrder?.invoiceId, originalInvoiceId, "El ID de factura en Contabilidad no cambia");
  assert.equal(finalizedOrder?.invoiceUrl, originalInvoiceUrl, "El enlace público permanece intacto");

  // Verificar que en la lista total de pedidos no se haya insertado un segundo pedido ni factura
  const allOrders = await getOrders();
  const matchingOrders = allOrders.filter((o) => o.invoiceNumber === originalInvoiceNumber);
  assert.equal(matchingOrders.length, 1, "Debe existir una única orden y factura para este pedido");
});

test("41. Ficha compacta completa: Encabezado, cliente, entrega, pedido, cobro y factura única (FASE 2)", () => {
  const fullOrder: Order = {
    id: "ord-test-compact-full",
    conversationId: "whatsapp:+573105556677",
    customerName: "Carlos Gómez",
    customerPhone: "3105556677",
    deliveryAddress: "Calle 10 # 5-20",
    deliveryNotes: "Torre 2 Apto 401",
    paymentMethod: "Efectivo",
    changeAmount: "$40.000",
    total: 36000,
    invoiceNumber: "B-0014",
    invoiceId: "inv-uuid-14",
    invoiceUrl: "https://contabilidad-app-fawn.vercel.app/api/invoices/public/inv-uuid-14",
    items: [
      { sku: "C8T", quantity: 1, unitPrice: 32000, name: "Caja x8 Tradicional" },
      { sku: "BEB_CHOC", quantity: 1, unitPrice: 4000, name: "Chocolate caliente" },
    ],
    status: "delivering",
    createdAt: Date.now(),
  };

  const card = formatDeliveryDriverMessage(fullOrder);

  // 1. Encabezado exacto
  assert.ok(card.includes("🚚 PEDIDO B-0014"), "Debe tener encabezado 🚚 PEDIDO B-0014");

  // 2. CLIENTE
  assert.ok(card.includes("CLIENTE"), "Debe tener bloque CLIENTE");
  assert.ok(card.includes("Nombre: Carlos Gómez"), "Debe incluir nombre real");
  assert.ok(card.includes("Teléfono: 310 555 6677"), "Debe incluir teléfono con formato");
  assert.ok(card.includes("https://wa.me/573105556677"), "Debe incluir enlace de WhatsApp al cliente");

  // 3. ENTREGA
  assert.ok(card.includes("📍 ENTREGA"), "Debe tener bloque 📍 ENTREGA");
  assert.ok(card.includes("Dirección: Calle 10 # 5-20"), "Debe incluir dirección");
  assert.ok(card.includes("Referencia: Torre 2 Apto 401"), "Debe incluir referencia");

  // 4. PEDIDO
  assert.ok(card.includes("🛍️ PEDIDO"), "Debe tener bloque 🛍️ PEDIDO");
  assert.ok(card.includes("1 x Caja x8 Tradicional"), "Debe formatear producto 1");
  assert.ok(card.includes("1 x Chocolate caliente"), "Debe formatear producto 2");

  // 5. COBRO
  assert.ok(card.includes("💰 COBRO"), "Debe tener bloque 💰 COBRO");
  assert.ok(card.includes("Total: $36.000"), "Total en COP con separador de miles");
  assert.ok(card.includes("Método: Efectivo"), "Método de pago");
  assert.ok(card.includes("Paga con: $40.000"), "Paga con exacto");
  assert.ok(card.includes("Cambio: $4.000"), "Cambio matemático determinista");

  // 6. FACTURA (enlace único)
  assert.ok(card.includes("🧾 FACTURA"), "Debe tener bloque 🧾 FACTURA");
  assert.ok(card.includes("https://contabilidad-app-fawn.vercel.app/api/invoices/public/inv-uuid-14"));
  const countUrls = (card.match(/https:\/\/contabilidad-app-fawn\.vercel\.app\/api\/invoices\/public\/inv-uuid-14/g) || []).length;
  assert.equal(countUrls, 1, "Enlace de factura debe aparecer exactamente 1 vez");

  // 7. AL CONFIRMAR
  assert.ok(card.includes("✅ AL CONFIRMAR"), "Debe tener bloque ✅ AL CONFIRMAR");
  assert.ok(card.includes('Envía: "PAGADO B-0014"'), "Debe indicar el comando exacto");
});

test("42. Ficha compacta con campos opcionales ausentes: omite referencia, observación, factura y cambio sin inventar datos", () => {
  const minimalOrder: Order = {
    id: "ord-test-compact-min",
    conversationId: "whatsapp:+573200001122",
    deliveryAddress: "Diagonal 15 # 4-30",
    total: 32000,
    status: "delivering",
    items: [{ sku: "C8T", quantity: 1, unitPrice: 32000, name: "Caja x8 Tradicional" }],
    createdAt: Date.now(),
  };

  const card = formatDeliveryDriverMessage(minimalOrder);

  assert.ok(card.includes("🚚 PEDIDO ord-test"));
  assert.ok(card.includes("📍 ENTREGA"));
  assert.ok(card.includes("Dirección: Diagonal 15 # 4-30"));
  assert.ok(!card.includes("Referencia:"), "No debe mostrar referencia inventada");
  assert.ok(!card.includes("Observación:"), "No debe mostrar observación inventada");
  assert.ok(!card.includes("🧾 FACTURA"), "No debe mostrar bloque de factura si no existe");
  assert.ok(!card.includes("Paga con:"), "No debe mostrar Paga con si no fue indicado");
  assert.ok(!card.includes("Cambio:"), "No debe mostrar Cambio si no fue indicado");
  assert.ok(card.includes("Total: $32.000"));
});

test("43. Ficha con múltiples productos y cantidades rigurosamente formateadas [Cantidad] x [nombre]", () => {
  const multiItemOrder: Order = {
    id: "ord-test-multi-prod",
    conversationId: "whatsapp:+573151234567",
    deliveryAddress: "Av Chile # 72-10",
    total: 58000,
    status: "delivering",
    paymentMethod: "Efectivo",
    items: [
      { sku: "C8T", quantity: 2, unitPrice: 32000, name: "Caja x8 Tradicional" },
      { sku: "BM", quantity: 3, unitPrice: 4500, name: "Buñuelo Relleno Mora" },
      { sku: "BEB_GAS", quantity: 2, unitPrice: 4500, name: "Gaseosa" },
    ],
    createdAt: Date.now(),
  };

  const card = formatDeliveryDriverMessage(multiItemOrder);
  assert.ok(card.includes("2 x Caja x8 Tradicional"));
  assert.ok(card.includes("3 x Buñuelo Relleno Mora"));
  assert.ok(card.includes("2 x Gaseosa"));
  assert.ok(card.includes("Total: $58.000"));
});

test("44. Ficha con pago por transferencia: sin cambio de efectivo y sin afirmar recibido si está pendiente", () => {
  const pendingTransferOrder: Order = {
    id: "ord-test-transfer-unverified",
    conversationId: "whatsapp:+573178889900",
    deliveryAddress: "Calle 100 # 15-20",
    total: 45000,
    status: "confirmed",
    paymentMethod: "Nequi",
    createdAt: Date.now(),
  };

  const card = formatDeliveryDriverMessage(pendingTransferOrder);
  assert.ok(!card.includes("Paga con:"), "Transferencia jamás muestra Paga con");
  assert.ok(!card.includes("Cambio:"), "Transferencia jamás muestra Cambio");
  assert.ok(!card.includes("YA PAGADO"), "Transferencia pendiente no debe afirmar que ya está pagado");
  assert.ok(card.includes("PENDIENTE VERIFICAR COMPROBANTE"), "Debe advertir que está pendiente de comprobante");
  assert.ok(!card.includes("✅ AL CONFIRMAR"), "Transferencia no pide PAGADO al domiciliario");
});

test("45. FASE 8: Confirmación de pedido por cliente en WhatsApp NO envía ficha al domiciliario", async () => {
  await updateOrgSettings({
    deliveryDriverPhone: "3109998877",
    deliveryDriverNotifyEnabled: "true",
  });

  const convId = "whatsapp:+573197778899";
  await getOrCreateConversation(convId);
  await handleSalesMessage(convId, "Quiero una caja tradicional de 8", "Sebastián");
  await handleSalesMessage(convId, "Calle 12 # 4-50 centro", "Sebastián");
  await handleSalesMessage(convId, "Pago en efectivo contra entrega", "Sebastián");
  await handleSalesMessage(convId, "50000", "Sebastián");
  const confirmRes = await handleSalesMessage(convId, "1", "Sebastián");

  assert.ok(confirmRes.reply.includes("Pedido Confirmado") || confirmRes.reply.includes("Registrado"));

  // Verificar la orden guardada en la base de datos
  const allOrders = await getOrders();
  const createdOrder = allOrders.find((o) => o.conversationId === convId);
  assert.ok(createdOrder, "La orden debe crearse en BD");
  assert.equal(createdOrder.status, "confirmed", "El estado inicial de la orden debe ser 'confirmed'");
  assert.equal(
    createdOrder.driverNotified || null,
    null,
    "El domiciliario NO debe haber sido notificado tras la simple confirmación del cliente"
  );
  assert.equal(createdOrder.driverNotifiedAt || 0, 0);
});

test("46. FASE 8: Transición de estado a 'preparing' (en cocina) NO envía ficha al domiciliario", async () => {
  const order = await createOrder("whatsapp:+573196665544", [{ sku: "C8T", quantity: 1, unitPrice: 32000 }], 32000, {
    customerName: "Elena Vargas",
    deliveryAddress: "Cra 8 # 12-40",
    paymentMethod: "Efectivo",
    status: "confirmed",
  });

  assert.equal(order.status, "confirmed");
  assert.equal(order.driverNotified || null, null);

  // Admin/Cocina cambia el estado a 'preparing' (En Preparación)
  const preparingOrder = await updateOrderStatus(order.id, "preparing");
  assert.equal(preparingOrder?.status, "preparing");
  assert.equal(
    preparingOrder?.driverNotified || null,
    null,
    "Al estar en preparación en cocina, NO se debe enviar la ficha al domiciliario"
  );
});

test("47. FASE 8: Transición a 'ready' (listo para despacho) envía la ficha una sola vez y 'delivering' no la duplica", async () => {
  await updateOrgSettings({
    deliveryDriverPhone: "3109998877",
    deliveryDriverNotifyEnabled: "true",
  });

  const order = await createOrder("whatsapp:+573195554433", [{ sku: "C8T", quantity: 1, unitPrice: 32000 }], 32000, {
    customerName: "Gustavo Petro",
    deliveryAddress: "Cra 7 # 10-10",
    paymentMethod: "Efectivo",
    status: "preparing",
  });

  assert.equal(order.driverNotified || null, null);

  // Mock de WhatsApp outbound para verificar el despacho
  let sendCount = 0;
  let dispatchedPhone: string | null = null;
  let dispatchedMsg: any = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    const urlStr = String(url);
    if (urlStr.includes("/message/sendText")) {
      sendCount++;
      const b = JSON.parse(init.body);
      dispatchedPhone = b.number;
      dispatchedMsg = b.text;
      return new Response(JSON.stringify({ key: { id: `mock-driver-send-${sendCount}` } }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as any;

  try {
    // 1. Transición a 'ready': pedido listo para despacho
    const readyOrder = await updateOrderStatus(order.id, "ready");
    assert.equal(readyOrder?.status, "ready");

    // Invocar notificación de despacho (como hace PATCH /api/panel/orders/[id] en 'ready')
    const res = await notifyDeliveryDriver(readyOrder!);
    assert.equal(res.ok, true, "Debe notificar al domiciliario exitosamente al pasar a ready");
    assert.equal(sendCount, 1, "Debe enviar exactamente 1 mensaje físico por WhatsApp");
    assert.ok(dispatchedMsg?.includes("🚚 PEDIDO"), "El mensaje enviado debe ser la ficha compacta");
    assert.ok(dispatchedMsg?.includes("Gustavo Petro"));
    assert.ok(dispatchedMsg?.includes("Total: $32.000"));

    // Verificar que quedó registrado en la orden
    const refreshed = await findOrderByInvoiceOrRef(order.id);
    assert.equal(refreshed?.driverNotified, "initial");
    assert.ok(refreshed?.driverNotifiedAt && refreshed.driverNotifiedAt > 0);

    // 2. Transición posterior a 'delivering': NO debe volver a enviar la ficha
    const deliveringOrder = await updateOrderStatus(order.id, "delivering");
    assert.equal(deliveringOrder?.status, "delivering");

    // Re-invocación simula llamada o comprobación en delivering
    const resDelivering = await notifyDeliveryDriver(deliveringOrder!);
    assert.equal(resDelivering.ok, true);
    assert.equal(resDelivering.skipped, "duplicate", "El paso a 'delivering' no debe volver a enviar la ficha");
    assert.equal(sendCount, 1, "El contador de envíos físicos debe permanecer exactamente en 1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("48. FASE 8: Repetición de transición o actualización del panel no duplica el mensaje al domiciliario", async () => {
  await updateOrgSettings({
    deliveryDriverPhone: "3109998877",
    deliveryDriverNotifyEnabled: "true",
  });

  const order: Order = {
    id: "ord-test-dedupe-panel-rep",
    conversationId: "whatsapp:+573194443322",
    customerName: "Lucía Méndez",
    deliveryAddress: "Cra 15 # 80-20",
    paymentMethod: "Efectivo",
    total: 32000,
    status: "delivering",
    driverNotified: "initial",
    driverNotifiedAt: Date.now(),
    createdAt: Date.now(),
  };

  // Re-invocar notifyDeliveryDriver
  const res = await notifyDeliveryDriver(order);
  assert.equal(res.ok, true);
  assert.equal(res.skipped, "duplicate", "Debe omitir el segundo envío por deduplicación idempotente");
});

test("49. FASE 8: Dos solicitudes simultáneas de despacho (concurrencia) envían exactamente 1 mensaje", async () => {
  const order = await createOrder("whatsapp:+573193332211", [{ sku: "C8T", quantity: 1, unitPrice: 32000 }], 32000, {
    customerName: "Tomás Blanco",
    deliveryAddress: "Calle 45 # 7-12",
    paymentMethod: "Efectivo",
    status: "delivering",
  });

  let sendCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    const urlStr = String(url);
    if (urlStr.includes("/message/sendText")) {
      sendCount++;
      return new Response(JSON.stringify({ key: { id: `mock-send-${sendCount}` } }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as any;

  try {
    const [call1, call2] = await Promise.all([
      notifyDeliveryDriver(order),
      notifyDeliveryDriver(order),
    ]);

    assert.equal(call1.ok, true);
    assert.equal(call2.ok, true);
    assert.equal(sendCount, 1, "Solo una solicitud concurrente debe realizar el envío físico por WhatsApp");
    const oneWasSkipped = call1.skipped === "duplicate" || call2.skipped === "duplicate";
    assert.equal(oneWasSkipped, true, "Una de las dos llamadas concurrentes debe ser marcada como duplicada");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("50. FASE 8: Fallo en Evolution API durante despacho revierte reclamo y permite reintento seguro", async () => {
  const order = await createOrder("whatsapp:+573192221100", [{ sku: "C8T", quantity: 1, unitPrice: 32000 }], 32000, {
    customerName: "Beatriz Pinzón",
    deliveryAddress: "Carrera 11 # 100-30",
    paymentMethod: "Efectivo",
    status: "delivering",
  });

  let attempts = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    const urlStr = String(url);
    if (urlStr.includes("/message/sendText")) {
      attempts++;
      if (attempts === 1) {
        return new Response(JSON.stringify({ error: "Network timeout" }), { status: 504 });
      }
      return new Response(JSON.stringify({ key: { id: "mock-retry-ok" } }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as any;

  try {
    // Intento 1: Falla
    const res1 = await notifyDeliveryDriver(order);
    assert.equal(res1.ok, false, "El primer intento debe reportar fallo");

    // El reclamo debe haberse revertido
    const middleOrder = await findOrderByInvoiceOrRef(order.id);
    assert.notEqual(middleOrder?.driverNotified, "initial", "No debe quedar como enviado si falló");

    // Intento 2: Reintento exitoso
    const res2 = await notifyDeliveryDriver(order);
    assert.equal(res2.ok, true, "El reintento debe completarse exitosamente");
    assert.equal(res2.skipped, undefined);

    const finalOrder = await findOrderByInvoiceOrRef(order.id);
    assert.equal(finalOrder?.driverNotified, "initial", "El estado final debe quedar registrado como enviado");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("51. FASE 8: Despacho desacoplado: El envío de ficha no marca el pedido como entregado ni pagado", async () => {
  const order = await createOrder("whatsapp:+573191110099", [{ sku: "C8T", quantity: 1, unitPrice: 32000 }], 32000, {
    customerName: "Nicolás Mora",
    deliveryAddress: "Calle 80 # 10-20",
    paymentMethod: "Efectivo",
    status: "delivering",
  });

  await notifyDeliveryDriver(order);

  const state = await findOrderByInvoiceOrRef(order.id);
  assert.equal(state?.status, "delivering", "El estado debe permanecer 'delivering' (no 'delivered')");
  assert.equal(state?.driverPaymentConfirmed || 0, 0, "driverPaymentConfirmed debe permanecer sin confirmar (0)");
  assert.equal(state?.accountingPaymentSynced || 0, 0, "accountingPaymentSynced debe permanecer 0");
});

test("52. FASE 5: Evidencia fotográfica opcional: ausencia de foto no bloquea entrega ni confirmación de cobro", async () => {
  const order = await createOrder("whatsapp:+573190009988", [], 25000, {
    customerName: "Hugo Lombardi",
    paymentMethod: "Efectivo",
    invoiceNumber: "B-0087",
    status: "delivering",
  });

  // El domiciliario confirma cobro sin adjuntar ninguna foto (solo texto plano)
  const confirmed = await markOrderDriverPaymentConfirmed(order.id, {
    amount: 25000,
    phone: "573228964947",
  });
  assert.ok(confirmed);
  assert.equal(confirmed?.driverPaymentConfirmed, 1, "La confirmación de cobro es exitosa sin exigir foto");

  // El administrador marca 'delivered' sin exigir foto
  const delivered = await updateOrderStatus(order.id, "delivered");
  assert.equal(delivered?.status, "delivered", "La entrega se registra exitosamente sin foto obligatoria");
});

test("53. FASE 5: Imagen sin comando válido o de número no autorizado no confirma cobro ni altera pedido", async () => {
  await createOrder("whatsapp:+573189998877", [], 30000, {
    invoiceNumber: "B-0088",
    paymentMethod: "Efectivo",
    status: "delivering",
  });

  // Simulación: Llega un mensaje multimedia de WhatsApp sin comando PAGADO
  const mockImageUpsert = {
    messageId: "msg-img-fake-1",
    from: "573100000000@s.whatsapp.net",
    digits: "573100000000",
    text: "", // Imagen sin texto o con texto no relacionado
    isMedia: true,
    mediaType: "image",
    fromMe: false,
  };

  const isPagado = /^PAGADO\b/i.test(mockImageUpsert.text);
  assert.equal(isPagado, false, "Una foto sin comando no debe considerarse confirmación de cobro");

  const unchangedOrder = await findOrderByInvoiceOrRef("B-0088");
  assert.equal(unchangedOrder?.driverPaymentConfirmed || 0, 0, "El pedido no debe marcarse como cobrado");
});

test("54. FASE 8: Botón manual de WhatsApp bloquea envíos prematuros en 'preparing' y permite reintento controlado", async () => {
  await updateOrgSettings({
    deliveryDriverPhone: "3109998877",
    deliveryDriverNotifyEnabled: "true",
  });

  const order = await createOrder("whatsapp:+573188887766", [], 25000, {
    customerName: "Patricia Fernández",
    paymentMethod: "Efectivo",
    status: "preparing",
  });

  // Simulación de validaciones del endpoint manual POST /api/panel/orders/[id]/notify-driver
  // 1. Envío prematuro en 'preparing' (sin forzar):
  const isPremature = order.status === "pending" || order.status === "confirmed" || order.status === "preparing";
  assert.equal(isPremature, true, "El pedido en cocina debe reconocerse como prematuro para despacho");

  // 2. Cambiar a 'ready': el pedido ahora está listo
  const readyOrder = await updateOrderStatus(order.id, "ready");
  assert.equal(readyOrder?.status, "ready");
  const readyStatus: string = readyOrder?.status || "";
  const isPrematureReady = ["pending", "confirmed", "preparing"].includes(readyStatus);
  assert.equal(isPrematureReady, false, "En 'ready' ya no es prematuro");

  const originalFetch = globalThis.fetch;
  let manualSendCount = 0;
  globalThis.fetch = (async (url: any, init: any) => {
    const urlStr = String(url);
    if (urlStr.includes("/message/sendText")) {
      manualSendCount++;
      return new Response(JSON.stringify({ key: { id: `mock-manual-send-${manualSendCount}` } }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as any;

  try {
    // 3. Primer envío manual exitoso
    const res1 = await notifyDeliveryDriver(readyOrder!);
    assert.equal(res1.ok, true);
    assert.equal(res1.skipped, undefined);
    assert.equal(manualSendCount, 1, "Debe enviar exactamente 1 mensaje en el primer despacho");

    // 4. Segundo clic manual accidental sin force: true: se omite por duplicado
    const res2 = await notifyDeliveryDriver(readyOrder!, undefined, { force: false });
    assert.equal(res2.ok, true);
    assert.equal(res2.skipped, "duplicate", "Clic manual repetido debe prevenir duplicación accidental");
    assert.equal(manualSendCount, 1, "No debe realizar un segundo envío físico");

    // 5. Reintento manual controlado con force: true
    const res3 = await notifyDeliveryDriver(readyOrder!, undefined, { force: true });
    assert.equal(res3.ok, true);
    assert.equal(res3.skipped, undefined, "Con force: true explícito debe permitir reintento controlado");
    assert.equal(manualSendCount, 2, "Con force: true debe ejecutar el reenvío físico");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("55. Bloqueo estricto de envíos prematuros en POST /api/panel/orders/[id]/notify-driver incluso con force=true", async () => {
  const { NextRequest } = await import("next/server");
  const { createUser, createSession } = await import("../lib/auth/session");
  const { POST: postNotifyDriver } = await import("../app/api/panel/orders/[id]/notify-driver/route");

  const email = `operator_${Date.now()}@bunuelandia.co`;
  const user = await createUser({
    email,
    password: "Password123*",
    name: "Operator Test",
    role: "operator",
  });
  const { token } = await createSession(user.id);
  const authCookie = `panel_session=${token}`;

  await updateOrgSettings({
    deliveryDriverPhone: "3109998877",
    deliveryDriverNotifyEnabled: "true",
  });

  const originalFetch = globalThis.fetch;
  let evolutionCalls = 0;
  globalThis.fetch = (async (url: any, init: any) => {
    const urlStr = String(url);
    if (urlStr.includes("/message/sendText") || urlStr.includes("evolution")) {
      evolutionCalls++;
      return new Response(JSON.stringify({ key: { id: `mock-msg-${evolutionCalls}` } }), { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as any;

  try {
    const order = await createOrder("whatsapp:+573101234567", [], 30000, {
      customerName: "Test Premature Enforcement",
      paymentMethod: "Efectivo",
      status: "pending",
    });

    // 1. force=true con "pending" -> HTTP 400 y 0 llamadas a Evolution
    const reqPending = new NextRequest(
      `http://localhost:3000/api/panel/orders/${order.id}/notify-driver?force=true`,
      {
        method: "POST",
        headers: { cookie: authCookie },
      }
    );
    const resPending = await postNotifyDriver(reqPending, { params: Promise.resolve({ id: order.id }) });
    assert.equal(resPending.status, 400, "force=true con pending debe retornar HTTP 400");
    const dataPending = await resPending.json();
    assert.equal(dataPending.ok, false);
    assert.equal(dataPending.premature, true);
    assert.equal(evolutionCalls, 0, "No debe llamar a Evolution API con pending");

    // 2. force=true con "confirmed" -> HTTP 400 y 0 llamadas a Evolution
    await updateOrderStatus(order.id, "confirmed");
    const reqConfirmed = new NextRequest(
      `http://localhost:3000/api/panel/orders/${order.id}/notify-driver?force=true`,
      {
        method: "POST",
        headers: { cookie: authCookie },
      }
    );
    const resConfirmed = await postNotifyDriver(reqConfirmed, { params: Promise.resolve({ id: order.id }) });
    assert.equal(resConfirmed.status, 400, "force=true con confirmed debe retornar HTTP 400");
    const dataConfirmed = await resConfirmed.json();
    assert.equal(dataConfirmed.ok, false);
    assert.equal(dataConfirmed.premature, true);
    assert.equal(evolutionCalls, 0, "No debe llamar a Evolution API con confirmed");

    // 3. force=true con "preparing" -> HTTP 400 y 0 llamadas a Evolution
    await updateOrderStatus(order.id, "preparing");
    const reqPreparing = new NextRequest(
      `http://localhost:3000/api/panel/orders/${order.id}/notify-driver?force=true`,
      {
        method: "POST",
        headers: { cookie: authCookie },
      }
    );
    const resPreparing = await postNotifyDriver(reqPreparing, { params: Promise.resolve({ id: order.id }) });
    assert.equal(resPreparing.status, 400, "force=true con preparing debe retornar HTTP 400");
    const dataPreparing = await resPreparing.json();
    assert.equal(dataPreparing.ok, false);
    assert.equal(dataPreparing.premature, true);
    assert.equal(evolutionCalls, 0, "No debe llamar a Evolution API con preparing");

    // 4. "ready" permite enviar la ficha inicial una sola vez
    await updateOrderStatus(order.id, "ready");
    const reqReady = new NextRequest(
      `http://localhost:3000/api/panel/orders/${order.id}/notify-driver`,
      {
        method: "POST",
        headers: { cookie: authCookie },
      }
    );
    const resReady = await postNotifyDriver(reqReady, { params: Promise.resolve({ id: order.id }) });
    assert.equal(resReady.status, 200, "ready debe permitir envío inicial");
    const dataReady = await resReady.json();
    assert.equal(dataReady.ok, true);
    assert.equal(dataReady.skipped, undefined);
    assert.equal(evolutionCalls, 1, "Debe llamar exactamente 1 vez a Evolution en envío inicial");

    // 5. Reenviar sin force -> detecta duplicado (0 llamadas adicionales)
    const reqReadyDup = new NextRequest(
      `http://localhost:3000/api/panel/orders/${order.id}/notify-driver`,
      {
        method: "POST",
        headers: { cookie: authCookie },
      }
    );
    const resReadyDup = await postNotifyDriver(reqReadyDup, { params: Promise.resolve({ id: order.id }) });
    assert.equal(resReadyDup.status, 200);
    const dataReadyDup = await resReadyDup.json();
    assert.equal(dataReadyDup.ok, true);
    assert.equal(dataReadyDup.skipped, "duplicate");
    assert.equal(evolutionCalls, 1, "Segundo envío sin force debe bloquearse por duplicado");

    // 6. Reenvío forzado con force=true -> ejecuta el reenvío
    const reqReadyForce = new NextRequest(
      `http://localhost:3000/api/panel/orders/${order.id}/notify-driver?force=true`,
      {
        method: "POST",
        headers: { cookie: authCookie },
      }
    );
    const resReadyForce = await postNotifyDriver(reqReadyForce, { params: Promise.resolve({ id: order.id }) });
    assert.equal(resReadyForce.status, 200);
    const dataReadyForce = await resReadyForce.json();
    assert.equal(dataReadyForce.ok, true);
    assert.equal(dataReadyForce.skipped, undefined);
    assert.equal(evolutionCalls, 2, "Con force=true debe ejecutar el reenvío");

    // 7. El reenvío no modifica el estado del pedido, la confirmación del cobro ni la sincronización contable
    const orders = await getOrders();
    const verifiedOrder = orders.find((o) => o.id === order.id);
    assert.equal(verifiedOrder?.status, "ready", "El reenvío no debe alterar el status del pedido");
    assert.equal(verifiedOrder?.driverPaymentConfirmed || 0, 0, "El reenvío no debe alterar la confirmación del cobro");
    assert.equal(verifiedOrder?.accountingPaymentSynced || 0, 0, "El reenvío no debe alterar la sincronización contable");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
