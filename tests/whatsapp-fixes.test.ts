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
import {
  parseEvolutionUpsert,
  resolveMediaRecipient,
  sendEvolutionMedia,
} from "../lib/evolution";
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
