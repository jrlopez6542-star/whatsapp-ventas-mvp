1
# WhatsApp Ventas MVP
2


3
App Next.js (App Router + TypeScript) estilo Clienteli-simple: webhook WhatsApp
4
(**Evolution API** preferido, **Twilio** fallback), catálogo editable en COP,
5
agente de ventas (OpenAI o keywords), **panel** con bandeja / chat / pedidos /
6
catálogo CRUD / config, y persistencia **Turso** (con fallback en memoria).
7


8
## Qué hace
9


10
- Bot de ventas por WhatsApp (cotiza, crea pedidos, escala a humano).
11
- Panel para tomar control y responder (Evolution REST o Twilio REST).
12
- Catálogo CRUD (crear / editar / desactivar).
13
- Config de negocio: nombre, tono, bienvenida y reglas → system prompt.
14
- Persistencia Turso cuando `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` están definidos.
15


16
## Canales WhatsApp
17


18
|
 Prioridad 
|
 Canal 
|
 Inbound 
|
 Outbound 
|
19
|
-----------
|
--------
|
---------
|
----------
|
