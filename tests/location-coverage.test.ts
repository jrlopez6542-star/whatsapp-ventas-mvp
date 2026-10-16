import test from "node:test";
import assert from "node:assert/strict";
import {
  checkCoverageLocation,
  getOutOfCoverageMessage,
} from "../lib/agent/order-validator";
import { getOrgSettings } from "../lib/store";
import { handleSalesMessage } from "../lib/agent/sales-agent";
import { getConversation, appendMessage } from "../lib/store";

test("Ubicación Oficial: OrgSettings tiene sede en Tocancipá, Cundinamarca por defecto", async () => {
  const settings = await getOrgSettings();
  assert.equal(settings.businessCity, "Tocancipá, Cundinamarca", "La ciudad sede oficial debe ser Tocancipá, Cundinamarca");
  assert.equal(settings.coverageArea, "Tocancipá y alrededores", "La zona de cobertura debe ser Tocancipá y alrededores");
  assert.ok(settings.rules.includes("Tocancipá"), "Las reglas del negocio deben hacer referencia a Tocancipá");
  assert.ok(!settings.rules.toLowerCase().includes("neiva"), "No debe haber referencias a Neiva en las reglas oficiales");
});

test("Cobertura: Dirección en Tocancipá y alrededores es reconocida dentro de cobertura", () => {
  // Ejemplos válidos en Tocancipá (urbanos, conjuntos, veredas)
  const tocan1 = checkCoverageLocation("Carrera 7 # 10-25 Tocancipá");
  assert.equal(tocan1.isOutOfCoverage, false, "Tocancipá debe estar dentro de cobertura");
  assert.equal(tocan1.isAmbiguous, false);

  const tocan2 = checkCoverageLocation("Vereda Canavita sector La Esmeralda");
  assert.equal(tocan2.isOutOfCoverage, false, "Vereda en Tocancipá debe estar dentro de cobertura");
  assert.equal(tocan2.isAmbiguous, false);

  const tocan3 = checkCoverageLocation("Conjunto Residencial Los Manzanos Torre 2 Apto 301 Tocancipá");
  assert.equal(tocan3.isOutOfCoverage, false, "Conjunto en Tocancipá debe estar dentro de cobertura");
  assert.equal(tocan3.isAmbiguous, false);

  const tocan4 = checkCoverageLocation("Calle 5 # 3-40");
  assert.equal(tocan4.isOutOfCoverage, false, "Nomenclatura urbana local no debe marcarse fuera de cobertura");
  assert.equal(tocan4.isAmbiguous, false);
});

test("Cobertura: Ubicación fuera de cobertura (Neiva, Medellín, Cali) es detectada y derivada a humano", async () => {
  // 1. Detección en validador
  const neivaCheck = checkCoverageLocation("Calle 10 # 5-20 Neiva Huila");
  assert.equal(neivaCheck.isOutOfCoverage, true, "Neiva debe ser marcado fuera de cobertura");
  assert.equal(neivaCheck.detectedLocation, "Neiva");

  const caliCheck = checkCoverageLocation("Avenida 6 Norte Cali Valle");
  assert.equal(caliCheck.isOutOfCoverage, true, "Cali debe ser marcado fuera de cobertura");
  assert.equal(caliCheck.detectedLocation, "Cali");

  const medellinCheck = checkCoverageLocation("Carrera 43A # 1-50 Medellín");
  assert.equal(medellinCheck.isOutOfCoverage, true, "Medellín debe ser marcado fuera de cobertura");
  assert.equal(medellinCheck.detectedLocation, "Medellín");

  // 2. Mensaje cortés de fuera de cobertura
  const msg = getOutOfCoverageMessage("Neiva", "Tocancipá, Cundinamarca", "Tocancipá y alrededores");
  assert.ok(msg.includes("Tocancipá"), "El mensaje debe aclarar que despachamos desde Tocancipá");
  assert.ok(msg.includes("asesor humano"), "El mensaje debe derivar a asesor humano");

  // 3. Flujo del agente con cliente solicitando entrega en Neiva
  const phone = `57300${Date.now().toString().slice(-7)}`;
  const res = await handleSalesMessage(phone, "Hola, quiero pedir buñuelos para entregar en Neiva Huila", "Cliente Remoto");

  assert.equal(res.mode, "human_escalated", "Debe escalar a asesor humano de inmediato");
  assert.ok(res.reply.includes("Tocancipá"), "La respuesta debe indicar que la sede es Tocancipá");
  assert.ok(res.reply.includes("Neiva"), "La respuesta debe mencionar la ciudad fuera de cobertura");

  const conv = await getConversation(phone);
  assert.equal(conv?.status, "human", "El estado de la conversación debe cambiar a 'human'");
});

test("Cobertura: Mensaje ambiguo o que no se pueda interpretar solicita aclaración sin entrar en bucle", async () => {
  // 1. Detección de ambigüedad
  const amb1 = checkCoverageLocation("ok");
  assert.equal(amb1.isAmbiguous, true, "'ok' debe considerarse ambiguo como dirección");

  const amb2 = checkCoverageLocation("si");
  assert.equal(amb2.isAmbiguous, true, "'si' debe considerarse ambiguo como dirección");

  const amb3 = checkCoverageLocation("👍");
  assert.equal(amb3.isAmbiguous, true, "Un emoji aislado no es una dirección");

  // 2. En el flujo del bot cuando se pide dirección:
  const phone = `57311${Date.now().toString().slice(-7)}`;

  // Simular conversación donde el bot ya pidió la dirección
  await appendMessage(phone, "user", "Quiero una caja x4 tradicional");
  await handleSalesMessage(phone, "Quiero una caja x4 tradicional", "Laura Test");

  // El bot pidió la dirección en el paso anterior. Ahora el usuario responde con un mensaje ambiguo:
  const resAmbiguous = await handleSalesMessage(phone, "ok dale", "Laura Test");

  assert.ok(
    resAmbiguous.reply.toLowerCase().includes("dirección") || resAmbiguous.reply.toLowerCase().includes("tocancipá"),
    "El bot debe solicitar amablemente la dirección exacta en Tocancipá sin perder el contexto"
  );
  assert.notEqual(resAmbiguous.mode, "human_escalated", "Un mensaje ambiguo no escala si no pide asesor explícito");
});

test("Independencia: Enviar coordenadas GPS o Google Maps NO altera la sede oficial del negocio", async () => {
  const initialSettings = await getOrgSettings();
  assert.equal(initialSettings.businessCity, "Tocancipá, Cundinamarca");

  const phone = `57315${Date.now().toString().slice(-7)}`;
  // Cliente pide productos
  await appendMessage(phone, "user", "Quiero una caja x8 tradicional");
  await handleSalesMessage(phone, "Quiero una caja x8 tradicional", "Juan GPS");

  // Cliente envía ubicación de Google Maps
  const mapsUrl = "https://maps.google.com/?q=4.9667,-73.9167";
  await appendMessage(phone, "user", mapsUrl);
  const resMaps = await handleSalesMessage(phone, mapsUrl, "Juan GPS");

  // Verificar que la sede oficial en la base de datos y configuración sigue siendo Tocancipá
  const currentSettings = await getOrgSettings();
  assert.equal(currentSettings.businessCity, "Tocancipá, Cundinamarca", "La ciudad oficial del negocio NO debe ser alterada por el cliente");

  // Verificar que el bot aceptó la ubicación como dirección de entrega
  assert.ok(
    resMaps.reply.toLowerCase().includes("pago") ||
    resMaps.reply.toLowerCase().includes("nequi") ||
    resMaps.reply.toLowerCase().includes("efectivo") ||
    resMaps.reply.toLowerCase().includes("resumen") ||
    resMaps.reply.toLowerCase().includes("dirección"),
    "El bot debe continuar el flujo de pedido usando el enlace GPS como destino de entrega"
  );
});
