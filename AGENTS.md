# AGENTS.md — Reglas para agentes de IA en `whatsapp-ventas-mvp` (Buñuelandia)

> Este archivo es un **contrato vinculante**. Si eres un agente (Antigravity, Cursor, Claude Code, Copilot, DeepSeek, etc.) trabajando en este repositorio, DEBES leerlo completo antes de tocar una sola línea. Las violaciones de estas reglas invalidan tu trabajo, aunque el código "compile".

---

## 0. TL;DR — Las 12 reglas que nunca se rompen

1. **NUNCA** crees scripts de parcheo (`patch*.js`, `fix_*.py`, `mod_*.js`, `inject_*.js`, etc.). Edita los archivos originales directamente.
2. **NUNCA** commitees secretos: `.pem`, `.key`, `.env`, `.env.local`, tokens, API keys ni URLs con credenciales.
3. **NUNCA** commitees archivos temporales: `old_*.txt`, `temp_*.tsx`, `*_backup.*`, `new_ui_template.txt`.
4. **NUNCA** uses mensajes de commit placeholder ("Descripcion clara de lo que agregaste", "update", "fix", "wip"). Usa Conventional Commits.
5. **SIEMPRE** corre `npx tsc --noEmit`, `npm run lint` y `npm run build` antes de proponer un commit. Si rompes el build, arréglalo tú.
6. **SIEMPRE** trabaja en una rama (`feat/...`, `fix/...`), nunca commitees directo a `main`.
7. **SIEMPRE** presenta un plan breve antes de editar, muestra el diff al terminar y pide confirmación antes de hacer commit o deploy.
8. **NUNCA** toques la raíz del repo sin justificarlo. La raíz tiene una lista blanca cerrada (ver §3).
9. **SI** un arreglo requiere más de 3 intentos, **DETENTE** y consulta al humano. No generes `fix_v2.js`, `fix_v3.js`.
10. **NUNCA** borres código de producción sin entender por qué existe.
11. **PROHIBIDO** usar botones interactivos nativos de WhatsApp (`buttonsMessage`, `listMessage`) en Evolution API/Baileys porque fallan en móviles reales. Usa siempre opciones numeradas en texto plano (`1️⃣`, `2️⃣`).
12. **SIEMPRE** respeta las reglas del Sistema Híbrido de Buñuelandia (ver §4): Domicilio GRATIS ($0), validación obligatoria de salsas en cajas surtidas, QR único post-confirmación y recálculo matemático contra el catálogo oficial.

---

## 1. Contexto y Arquitectura Real del Proyecto

**Qué es:** Sistema en producción de ventas y atención automatizada por WhatsApp para **Buñuelandia**, con panel de administración en tiempo real, verificación de comprobantes con IA Visión, transcripción de notas de voz, despacho a domiciliario y facturación electrónica conectada a sistema contable externo.

**Stack en Producción:**
- **Framework:** Next.js (App Router) + TypeScript + Tailwind CSS (desplegado en Vercel).
- **Persistencia:** Turso / libSQL (`lib/store.ts`) con soporte de cola e idempotencia.
- **Canal WhatsApp:** Evolution API (Baileys) en `lib/evolution.ts` y `lib/whatsapp-send.ts`.
- **Agente Híbrido IA + Reglas:** Gemini (`gemini-2.5-flash` / `gemini-2.0-flash`) y OpenAI (`gpt-4o-mini`) en `lib/agent/sales-agent.ts`, verificación de recibos en `lib/agent/receipt-verifier.ts` y transcripción en `lib/agent/audio-transcriber.ts`.
- **Facturación Externa:** Sincronización con `contabilidad-app` mediante `lib/contabilidad.ts`.

**Estructura del repositorio:**
```
app/
  api/
    health/
    catalog/
    webhooks/evolution/route.ts  → Webhook principal (Fast ACK + after() + Debounce)
    panel/                       → Endpoints autenticados de administración
  panel/page.tsx                 → UI del panel (bandeja, chat en vivo, pedidos, catálogo, config)
lib/
  store.ts                       → Persistencia en Turso (conversaciones, mensajes, pedidos, locks)
  evolution.ts                   → Cliente y parser de Evolution API (texto, audio, imagen, GPS, llamadas)
  outbound-queue.ts              → Cola FIFO por conversación + Rate Limiter global anti-baneo
  delivery-driver.ts             → Notificaciones formateadas al domiciliario
  contabilidad.ts                → Integración con app de facturación
  agent/
    sales-agent.ts               → Orquestador de ventas (IA + Candados deterministas)
    order-validator.ts           → Validación estricta de salsas, bebidas y sumas matemáticas
    catalog.ts                   → Catálogo oficial y precios desde Turso
    receipt-verifier.ts          → Verificación de comprobantes Nequi/Bre-B con Gemini Visión
    audio-transcriber.ts         → Transcripción de notas de voz
scripts/                         → Utilidades legítimas (ej. test-bot.mjs)
tests/                           → Suite de pruebas automatizadas (Vitest)
public/                          → Assets estáticos (QR, sonidos, íconos)
```

---

## 2. Antes de empezar cualquier tarea

Ejecuta en orden y detente si algo falla:

```bash
git status                    # Verificar estado limpio
git checkout -b fix/<nombre>  # Crear o cambiar a la rama de trabajo
npm ci                        # Instalar según lockfile si es necesario
npx tsc --noEmit              # Typecheck estricto
npm run lint                  # Linter
npm run build                 # Verificar que el build actual compila
```

---

## 3. Raíz del repositorio — Lista Blanca

**Únicos archivos permitidos en la raíz:**
```
.gitignore
README.md
AGENTS.md
CLAUDE.md
LICENSE
package.json
package-lock.json
tsconfig.json
next.config.ts
next-env.d.ts
eslint.config.mjs
middleware.ts
.env.example
vitest.config.ts
```
Cualquier script suelto (`patch*.js`, `fix_*.py`, `temp_*`, `.pem`, `.env`) está estrictamente prohibido.

---

## 4. Reglas de Negocio Inmutables de Buñuelandia (Sistema Híbrido)

Cualquier cambio en `lib/agent/`, `lib/delivery-driver.ts` o `app/api/webhooks/evolution/route.ts` debe garantizar:

### 4.1 Memoria y Contexto
- **Ventana de 20 mensajes:** En `buildGeminiContents` y `buildOpenAIMessages`, enviar los últimos 20 mensajes (`.slice(-20)`) posteriores al último pedido finalizado para no olvidar ítems, salsas ni bebidas.

### 4.2 Candado de Salsas, Bebidas y Domicilio Gratis ($0)
- **Domicilio 100% Gratis:** `deliveryFee` es SIEMPRE `0`. Prohibido sumar cobros de envío o topes mínimos.
- **Candado Determinista de Salsas:** Si el pedido incluye una Caja Surtida (`C4S` o `C8S`), es obligatorio validar por código que el cliente haya elegido salsas (*Mora, Arequipe, Bocadillo o Suero Costeño* / *todas* / *sin salsa*) antes de permitir pedir dirección, mostrar resumen o crear la orden.
- **Candado Matemático:** El total del pedido (`order.total`) debe recalcularse en código multiplicando `cantidad * precio_oficial` del catálogo en Turso (incluyendo bebidas: Café $3.500, Chocolate $4.000, Gaseosa $4.500, Jugo de mora $6.000, Agua $3.000). Nunca confiar ciegamente en la suma escrita por el LLM.

### 4.3 Doble Confirmación y Control de QR (Paso 6 vs. Paso 7)
- **Paso 6 (Resumen Previo):** Muestra el resumen compacto y las opciones `1️⃣ ✅ Confirmar pedido` y `2️⃣ ✏️ Modificar algún dato`.
  - **PROHIBIDO** crear la orden en BD, emitir factura o enviar el código QR / bloque largo de cuentas bancarias en el Paso 6.
- **Paso 7 (Confirmación Final):** Solo cuando el cliente confirma con `1`:
  - Se registra la orden en Turso (`createOrder`) y se genera la factura en `contabilidad-app`.
  - Si el medio de pago es `Nequi` o `Bre-B`, se envían los datos de pago y el código QR **una única vez**.
  - Si el medio de pago es `Efectivo`, **nunca** se envía QR ni datos de transferencia.

### 4.4 Privacidad `@lid` y Captura de Teléfono Real (10 dígitos)
- Los identificadores `@lid` de WhatsApp NO son números telefónicos.
- Si la conversación es `@lid` y no tenemos en BD un móvil colombiano válido de 10 dígitos (`/^3\d{9}$/`), el bot debe pedirle al cliente que escriba sus 10 dígitos.
- **Intercepción obligatoria:** Si el cliente responde *"al mismo número"*, *"a este mismo"* o *"al de WhatsApp"* sin que tengamos sus 10 dígitos reales, el código debe rechazar amablemente esa respuesta y solicitar los 10 dígitos numéricos, persistiendo el número en `conv.phone` y enviándolo en la ficha del domiciliario.

### 4.5 Pines de Ubicación GPS (`locationMessage`)
- Si el cliente envía un pin de ubicación de WhatsApp (`locationMessage` o `liveLocationMessage`), extraer `lat` y `lng`, transformarlo en enlace oficial (`https://maps.google.com/?q=lat,lng`), guardarlo como dirección del pedido y enviarlo cliqueable al domiciliario.

### 4.6 Notificaciones al Domiciliario y Validación de Comprobantes
- **Transferencias recién creadas (`status: pending`):** La ficha inicial del domiciliario NUNCA debe decir `✅ YA PAGADO`. Debe indicar claramente: `⏳ PAGO POR TRANSFERENCIA (PENDIENTE VERIFICAR COMPROBANTE)`.
- **Validación con Gemini Visión:** Antes de marcar un pedido como pagado (`preparing`) y notificar `✅ PAGO VERIFICADO` al domiciliario, comprobar que:
  1. Exista un pedido activo pendiente de la conversación.
  2. La imagen sea un comprobante real (`isValidReceipt === true`).
  3. El monto extraído del comprobante coincida con `order.total`.
  4. El pedido no haya sido verificado previamente (evitar notificaciones duplicadas).

### 4.7 Webhook, Concurrencia y Blindaje Anti-Baneo
- **Fast ACK (<80ms):** Responder `200 OK` de inmediato y procesar IA, audios y visión dentro de `after()`.
- **Debounce:** Mantener ventana de agrupación de mensajes en ráfaga (`3200ms`).
- **Comportamiento biométrico:** Marcar visto tras pausa de lectura (`1.2s–2.2s`), emitir presencia `"composing"` proporcional al texto, pausar `2.2s–3.8s` antes de adjuntar QR/PDF, variar textos fijos (`pickRandom`) y respetar el espaciado global entre chats en `outbound-queue.ts`.
- **Instancia segura:** Mantener `alwaysOnline: false`, `groupsIgnore: true` y `readMessages: false`.

---

## 5. Flujo de Trabajo y Commits

1. **Plan primero:** Antes de editar, revisa los archivos implicados y presenta un plan breve (3–6 puntos). Espera autorización.
2. **Cambios mínimos y limpios:** Muestra el `diff` claro de los archivos tocados.
3. **Verificación obligatoria:** Ejecuta `npx tsc --noEmit`, `npm run lint`, `npm run build` y los tests en `tests/`. No declares una prueba exitosa sin haberla corrido.
4. **Conventional Commits:** `fix(agent): ...`, `feat(webhook): ...`, `test(orders): ...`. Prohibido hacer commit o push sin autorización expresa del humano.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
