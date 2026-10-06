# WhatsApp Ventas MVP

App Next.js (App Router + TypeScript) estilo Clienteli-simple: webhook WhatsApp
(**Evolution API** preferido, **Twilio** fallback), catálogo editable en COP,
agente de ventas (OpenAI o keywords), **panel** con bandeja / chat / pedidos /
catálogo CRUD / config, y persistencia **Turso** (con fallback en memoria).

## Qué hace

- Bot de ventas por WhatsApp (cotiza, crea pedidos, escala a humano).
- Panel para tomar control y responder (Evolution REST o Twilio REST).
- Catálogo CRUD (crear / editar / desactivar).
- Config de negocio: nombre, tono, bienvenida y reglas → system prompt.
- Persistencia Turso cuando `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` están definidos.

## Canales WhatsApp

| Prioridad | Canal | Inbound | Outbound |
|-----------|--------|---------|----------|
| 1 | **Evolution** (Baileys, Docker local) | `POST /api/webhooks/evolution` | REST `sendText` si `EVOLUTION_*` |
| 2 | **Twilio** | `POST /api/webhooks/twilio/whatsapp` → TwiML | REST si `TWILIO_*` |

Si Evolution está configurado (`EVOLUTION_API_URL` + `EVOLUTION_API_KEY` +
`EVOLUTION_INSTANCE`), el panel y las respuestas del webhook Evolution usan ese
canal. Sin esas vars, Twilio sigue funcionando igual que antes.

Guía Docker + QR + tunnel: [`docker/evolution/README.md`](docker/evolution/README.md).

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/health` | `{ ok, channel, evolutionConfigured, twilioSendConfigured, … }` |
| `GET` | `/api/catalog` | Catálogo activo (JSON, COP) |
| `GET/POST` | `/api/webhooks/evolution` | Health / inbound Evolution → reply REST |
| `GET/POST` | `/api/webhooks/twilio/whatsapp` | Health / inbound Twilio → TwiML |
| — | `/panel` | Bandeja (filtros bot/humano/todos + refresh) |
| — | `/panel/c/[id]` | Chat + takeover + respuesta manual |
| — | `/panel/pedidos` | Pedidos con badges de estado |
| — | `/panel/catalogo` | Catálogo CRUD |
| — | `/panel/config` | Nombre, tono, reglas, bienvenida |
| — | `/panel/login` | Login del panel |
| `GET/POST` | `/api/panel/products` | Listar / crear productos |
| `PATCH/DELETE` | `/api/panel/products/[sku]` | Editar / desactivar |
| `GET/PUT` | `/api/panel/settings` | Leer / guardar org_settings |

Firma Twilio: opcional. Si defines `TWILIO_AUTH_TOKEN`, se valida. **TODO:** forzarla en producción.
Webhook Evolution: opcional `EVOLUTION_WEBHOOK_SECRET` (header `x-evolution-secret`).

## Persistencia (`lib/store/*`)

- Con `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` → Turso/libSQL.
- Sin esas vars → memoria (se pierde en cold start / redeploy).
- Schema: `conversations`, `messages`, `orders`, `order_items`, `products` (seed si vacío), `org_settings`.
- Webhook y panel usan la misma abstracción (`getStore()`).

DB de referencia: `whatsapp-ventas` → `libsql://whatsapp-ventas-jrlopez1306.aws-us-east-1.turso.io`.

## Panel

- Auth-light con `PANEL_PASSWORD` (vacío = abierto + aviso).
- **Bandeja:** filtros bot / humano / todos, refresh, badge de store y canal.
- **Chat:** burbujas claras, Tomar control / Devolver al bot, envío manual (auto-takeover).
- **Takeover:** en `human` el webhook solo guarda inbound (sin reply AI).
- **Catálogo:** create / edit / deactivate (soft).
- **Config:** se inyecta en el system prompt del agente.

## Variables de entorno

Copia `.env.example` → `.env.local` (y configúralas en Vercel Production):

| Variable | Requerida | Uso |
|----------|-----------|-----|
| `EVOLUTION_API_URL` | Canal Evolution | URL pública del tunnel a tu Docker (`https://….trycloudflare.com`) |
| `EVOLUTION_API_KEY` | Canal Evolution | Mismo valor que `AUTHENTICATION_API_KEY` del compose |
| `EVOLUTION_INSTANCE` | Canal Evolution | Nombre de instancia (ej. `ventas`) |
| `EVOLUTION_WEBHOOK_SECRET` | No | Si se setea, exige header `x-evolution-secret` |
| `TWILIO_ACCOUNT_SID` | Fallback / Twilio | REST send |
| `TWILIO_AUTH_TOKEN` | Fallback / Twilio | Signature + Basic auth |
| `TWILIO_WHATSAPP_FROM` | Fallback / Twilio | Ej. sandbox `whatsapp:+14155238886` |
| `OPENAI_API_KEY` | No | Agente con tools |
| `OPENAI_MODEL` | No | Default `gpt-4o-mini` |
| `PANEL_PASSWORD` | Recomendado | Protege `/panel` |
| `TURSO_DATABASE_URL` | Para durable | `libsql://whatsapp-ventas-jrlopez1306.aws-us-east-1.turso.io` |
| `TURSO_AUTH_TOKEN` | Para durable | Token de DB Turso |
| `WHATSAPP_REPLY_DELAY_MIN_MS` | No | Mín. retraso reply bot (default `2500`) |
| `WHATSAPP_REPLY_DELAY_MAX_MS` | No | Máx. retraso reply bot (default `5500`) |

Sin `TURSO_*` la app funciona en memoria. Sin `EVOLUTION_*` ni `TWILIO_*` de
envío, el webhook Twilio TwiML sigue respondiendo; solo falla el envío manual
del panel y las replies Evolution.

## Anti-baneo (retraso + cola)

Las respuestas del webhook Evolution se envían con un retraso aleatorio
configurable (por defecto **2.5–5.5 s**) y se serializan **por conversación**
(FIFO en la instancia + candado corto en Turso entre instancias). El webhook
hace ACK 200 tras generar la respuesta y agenda el envío con `after()` de
Next.js para no bloquear a Evolution ni provocar reintentos por timeout.
Eventos que no son `MESSAGES_UPSERT` (o sin texto respondible) no se retrasan.

## Frases de prueba

- `hola` · `catálogo` · `bolsas kraft` · `cotizar KIT-INI-01 x2` · `pedido` · `escalar humano`

## Evolution (recomendado)

1. Sigue [`docker/evolution/README.md`](docker/evolution/README.md): `docker compose up -d`, crea instancia, escanea QR.
2. Expón el puerto 8080 con cloudflared/ngrok.
3. En Vercel define `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`.
4. Webhook de la instancia → `https://whatsapp-ventas-mvp.vercel.app/api/webhooks/evolution`

```bash
# Crear instancia
curl -s -X POST "http://localhost:8080/instance/create" \
  -H "apikey: TU_API_KEY" -H "Content-Type: application/json" \
  -d '{"instanceName":"ventas","integration":"WHATSAPP-BAILEYS","qrcode":true}'

# Set webhook
curl -s -X POST "http://localhost:8080/webhook/set/ventas" \
  -H "apikey: TU_API_KEY" -H "Content-Type: application/json" \
  -d '{"webhook":{"enabled":true,"url":"https://whatsapp-ventas-mvp.vercel.app/api/webhooks/evolution","byEvents":false,"base64":false,"events":["MESSAGES_UPSERT"]}}'
```

## Sandbox Twilio (fallback)

1. [Try WhatsApp](https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn) → `join …`.
2. Webhook POST: `https://<host>/api/webhooks/twilio/whatsapp`
3. Abre `/panel`.

## Local

```bash
npm install
npm run dev
```

```bash
curl -X POST http://localhost:3000/api/webhooks/twilio/whatsapp \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=whatsapp%3A%2B573001112233&To=whatsapp%3A%2B14155238886&Body=bolsas%20kraft&MessageSid=SMtest"

curl -X POST http://localhost:3000/api/webhooks/evolution \
  -H "Content-Type: application/json" \
  -d '{"event":"messages.upsert","data":{"key":{"remoteJid":"573001112233@s.whatsapp.net","fromMe":false,"id":"TEST1"},"message":{"conversation":"hola"}}}'

curl http://localhost:3000/api/health
```

## Deploy (Vercel)

Proyecto: `whatsapp-ventas-mvp` (team `jrlopez6542-1905`).

```bash
vercel link --yes --project whatsapp-ventas-mvp
# Asegurar en Production: PANEL_PASSWORD, TURSO_*, OPENAI_* (opc.)
# Evolution: añade EVOLUTION_* cuando tengas tunnel + instancia (no hace falta al primer deploy)
# Twilio: TWILIO_* como fallback
vercel deploy --prod --yes
```

Luego pega la URL de producción del webhook en Evolution (o Twilio Console).