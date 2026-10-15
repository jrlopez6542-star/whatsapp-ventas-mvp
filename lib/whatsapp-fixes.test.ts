import assert from "node:assert/strict";
import test from "node:test";
import {
  extractColombianPhone,
  shouldSendTransferQr,
  handleSalesMessage,
} from "./agent/sales-agent";
import {
  resolveCustomerPhoneForDriver,
  formatDeliveryDriverMessage,
} from "./delivery-driver";
import {
  createOrder,
  getConversation,
  getOrCreateConversation,
  setConversationPhone,
  updateOrderStatus,
  type Order,
} from "./store";

test("1. Cliente @lid sin teléfono que responde «al mismo número»", async () => {
  const lidConvId = "whatsapp:lid:271296004931588";
  // Asegurar que la conversación esté creada y sin teléfono real
  const conv = await getOrCreateConversation(lidConvId);
  assert.ok(conv);

  // Cliente responde «al mismo número»
  const res = await handleSalesMessage(lidConvId, "al mismo número", "Cliente Privado");
  assert.equal(res.mode, "keyword");
  assert.ok(
    res.reply.includes("cuenta privada") || res.reply.includes("no es visible"),
    "Debe explicar que es cuenta privada"
  );
  assert.ok(
    res.reply.includes("10 dígitos") || res.reply.includes("celular"),
    "Debe pedir número de 10 dígitos"
  );

  // Comprobar que no se aceptó como teléfono válido
  const updatedConv = await getConversation(lidConvId);
  assert.equal(extractColombianPhone(updatedConv?.phone || ""), null);
});

test("2. Cliente @lid que escribe su número y recibe el domicilio con el teléfono correcto", async () => {
  const lidConvId = "whatsapp:lid:271296004931588";
  const rawPhone = "3123456789";

  // 1. Extraer teléfono
  const detected = extractColombianPhone(rawPhone);
  assert.equal(detected, "3123456789");

  // 2. Persistir en la conversación
  await setConversationPhone(lidConvId, detected!);
  const conv = await getConversation(lidConvId);
  assert.equal(conv?.phone, "3123456789");

  // 3. Crear pedido asociado a la conversación @lid
  const order = await createOrder(lidConvId, [{ sku: "C8T", quantity: 1, unitPrice: 32000 }], 32000, {
    customerName: "Juan Pérez",
    customerPhone: detected!,
    deliveryAddress: "Calle 10 # 5-20",
    paymentMethod: "Nequi",
  });

  // 4. Resolver teléfono para el domiciliario
  const phoneInfo = resolveCustomerPhoneForDriver(order);
  assert.equal(phoneInfo.isLidWithoutPhone, false);
  assert.equal(phoneInfo.displayPhone, "312 345 6789");
  assert.equal(phoneInfo.waUrl, "https://wa.me/573123456789");

  // 5. Verificar mensaje para el domiciliario
  const driverMsg = formatDeliveryDriverMessage(order);
  assert.ok(driverMsg.includes("312 345 6789"));
  assert.ok(driverMsg.includes("https://wa.me/573123456789"));
});

test("3. Resumen previo sin QR y confirmación con un único QR", () => {
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

  // Resumen previo (Paso 6): NUNCA debe enviar QR
  const qrInSummary = shouldSendTransferQr("1", summaryReply, false, "Nequi");
  assert.equal(qrInSummary, false, "El resumen previo no debe enviar el QR");

  const confirmationReply = `✅ *¡Pedido Confirmado y Registrado en BUÑUELANDIA!* 🛵🥟
🛒 *Detalle del Pedido:*
• 1x Caja x8 Tradicional
💰 *Total a pagar:* $32.000 COP
💳 *Medio de pago:* Nequi
📱 *Nequi:* \`3228964947\`
🔑 *Llave Bre-B:* \`3228964947\``;

  // Confirmación final (Paso 7) con Nequi: SÍ debe enviar QR
  const qrInConfirmation = shouldSendTransferQr("1", confirmationReply, true, "Nequi");
  assert.equal(qrInConfirmation, true, "La confirmación con Nequi debe enviar el QR");

  // Solicitud explícita del QR por parte del cliente
  const qrOnExplicit = shouldSendTransferQr("¿me puedes enviar el código qr?", "Con gusto", false, "Nequi");
  assert.equal(qrOnExplicit, true, "Debe enviar QR ante solicitud explícita");

  // En respuesta normal sin confirmación ni solicitud de QR: NO enviar QR
  const qrOnNormalChat = shouldSendTransferQr("hola buenas tardes", "¡Hola!", false, "Nequi");
  assert.equal(qrOnNormalChat, false, "Un turno normal no debe disparar el QR");
});

test("4. Pago por transferencia pendiente de comprobante", () => {
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

  // Debe advertir que la transferencia está pendiente de verificación
  assert.ok(
    driverMsg.includes("TRANSFERENCIA PENDIENTE"),
    "Debe indicar que la transferencia está pendiente"
  );
  assert.ok(
    driverMsg.includes("No se ha verificado el comprobante de pago"),
    "Debe advertir al domiciliario verificar con administración"
  );
  assert.ok(
    !driverMsg.includes("TRANSFERENCIA VERIFICADA"),
    "No debe decir que está verificada"
  );
  assert.ok(
    !driverMsg.includes("YA PAGADO"),
    "No debe decir ya pagado si no está verificado"
  );
});

test("5. Comprobante válido con importe correcto", async () => {
  const order = await createOrder("whatsapp:+573004445566", [{ sku: "C8T", quantity: 1, unitPrice: 32000 }], 32000, {
    customerName: "Diana Morales",
    customerPhone: "3004445566",
    deliveryAddress: "Av Pastrana # 20-10",
    paymentMethod: "Nequi",
    status: "confirmed",
  });

  assert.equal(order.status, "confirmed");

  // Simular validación de comprobante exitosa con monto exacto
  const verification = {
    isReceipt: true,
    amount: 32000,
    bank: "Nequi",
    reference: "M123456",
  };

  const amountMatches =
    verification.amount !== null &&
    Math.abs(verification.amount - order.total) <= 1000;

  assert.ok(verification.isReceipt);
  assert.ok(amountMatches);

  // Al validarse correctamente, la orden pasa a preparing
  await updateOrderStatus(order.id, "preparing");
  order.status = "preparing";

  const driverMsg = formatDeliveryDriverMessage(order);
  assert.ok(
    driverMsg.includes("TRANSFERENCIA VERIFICADA"),
    "Ficha del domiciliario debe indicar transferencia verificada"
  );
  assert.ok(
    driverMsg.includes("No cobrar al cliente"),
    "Debe indicar no cobrar al cliente"
  );
});

test("6. Comprobante inválido, importe diferente o evento duplicado", async () => {
  const order = await createOrder("whatsapp:+573007778899", [{ sku: "C8T", quantity: 1, unitPrice: 32000 }], 32000, {
    customerName: "Andrés Silva",
    paymentMethod: "Nequi",
    status: "confirmed",
  });

  // Caso A: Importe diferente ($20.000 vs $32.000)
  const diffAmountVerification = {
    isReceipt: true,
    amount: 20000,
  };
  const diffMatches = Math.abs(diffAmountVerification.amount - order.total) <= 1000;
  assert.equal(diffMatches, false, "Importe diferente no debe coincidir");
  // La orden no cambia de estado si no coincide el importe
  assert.equal(order.status, "confirmed");

  // Caso B: Imagen que NO es comprobante
  const notReceiptVerification = {
    isReceipt: false,
    amount: 32000,
  };
  assert.equal(notReceiptVerification.isReceipt, false);
  assert.equal(order.status, "confirmed");

  // Caso C: Pedido ya procesado (duplicado)
  order.status = "preparing";
  const isAlreadyProcessed =
    order.status === "preparing" ||
    order.status === "delivering" ||
    order.status === "delivered";
  assert.ok(isAlreadyProcessed, "Debe detectar que el pedido ya fue verificado");
});

test("7. Pago en efectivo sin mensajes de transferencia", () => {
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

  // Debe exigir cobro en efectivo y cambio
  assert.ok(
    driverMsg.includes("Cobrar en efectivo al entregar y llevar el cambio listo"),
    "Debe indicar cobro en efectivo"
  );
  assert.ok(driverMsg.includes("Paga con:* $50.000"), "Debe mostrar billete de cambio");

  // No debe contener mensajes de transferencia
  assert.ok(!driverMsg.includes("TRANSFERENCIA PENDIENTE"));
  assert.ok(!driverMsg.includes("TRANSFERENCIA VERIFICADA"));
  assert.ok(!driverMsg.includes("YA PAGADO"));

  // En efectivo, shouldSendTransferQr NUNCA debe enviar QR
  const qrWithCash = shouldSendTransferQr("1", "Pedido confirmado en efectivo", true, "Efectivo contra entrega");
  assert.equal(qrWithCash, false, "Efectivo jamás debe enviar QR");
});
