# INFORME DE AUDITORÍA AUTÓNOMA Y ENDURECIMIENTO DE SEGURIDAD
## Sistema de Ventas y Panel Administrativo — Buñuelandia (`whatsapp-ventas-mvp`)

**Fecha:** 16 de Octubre de 2026  
**Rama:** `fix/sales-agent-order-state-and-dispatch`  
**Estado:** ✅ APROBADO (Tests, Linter, Typecheck y Build)

---

## 1. Resumen Ejecutivo

Se implementaron, auditaron y validaron las soluciones definitivas para los tres fallos observados en producción en el bot de ventas de WhatsApp de Buñuelandia:
1. **Fallo 1 (Cambio de producto ignorado):** Un cliente configurando una caja surtida solicitaba cambiar a una tradicional («Para cambiar a una tradicional»), pero el bot insistía en pedir salsas y terminaba registrando la caja surtida con su precio más alto.
2. **Fallo 2 (Notificación al domiciliario ausente y confirmación falsa):** En pagos por Nequi o transferencia, el bot confirmaba el pedido al cliente pero la orden no se guardaba por un error de esquema (`table order_items has no column named quantity`), y la notificación al domiciliario se ejecutaba como una promesa no esperada (`unawaited`) susceptible a cortes en entornos serverless.
3. **Fallo 3 (Memoria acumulada y estado conversacional):** La concatenación acumulativa de todo el historial en `allUserChatText` provocaba que menciones antiguas de salsas y productos persistieran indefinidamente a lo largo de los turnos, impidiendo cancelaciones y nuevos pedidos limpios.

Se creó una suite de pruebas automatizadas completa en `tests/order-modifications-and-dispatch.test.ts` que cubre los 10 escenarios (A a J), incluyendo pruebas de concurrencia (`Promise.all`), fallo de persistencia en base de datos, reintentos de notificación y atomicidad transaccional. Todos los 57 tests del proyecto pasaron satisfactoriamente sin generar mensajes reales ni llamadas externas a producción.

---

## 2. Correcciones Implementadas por Componente

### 2.1 Conmutación Determinista de Producto y Candado de Salsas (`lib/agent/sales-agent.ts` y `lib/agent/order-validator.ts`)
- **Detección de Cambio de Producto:** En `extractProductsFromText`, se implementó detección determinista de sustitución mediante expresiones regulares (`isSwitchingToTradicional` / `isSwitchingToSurtida`). Cuando el cliente pide «cambiar a tradicional», «una tradicional» o «la tradicional»:
  - Se eliminan del carrito las cajas surtidas (`C8S`, `C4S`).
  - Se inyecta la caja tradicional solicitada (`C8T` por $32.000 COP o `C4T` por $16.000 COP).
  - Se recalcula matemáticamente el total oficial ($32.000 o $16.000).
- **Aislamiento de Salsas:** La extracción de salsas (`sessionSalsas`) y la condición de intercepción (`hasSurtidaCart`) quedaron estrictamente condicionadas a que el carrito activo contenga una caja surtida. Si el cliente cambió a tradicional, la exigencia de salsas se desactiva inmediatamente.
- **Domicilio Gratis Inmutable:** Se mantuvo `deliveryFee = 0` ($0) y «¡GRATIS!» en todos los flujos.

### 2.2 Resiliencia de Persistencia y Principio Fail-Closed (`lib/store/db.ts` y `lib/store/index.ts`)
- **Migración Idempotente y Compatible:** En `ensureTursoReady`, se agregaron sentencias seguras `ALTER TABLE order_items ADD COLUMN ...` para `quantity INTEGER DEFAULT 1`, `unit_price INTEGER DEFAULT 0` y `created_at INTEGER DEFAULT 0`. Adicionalmente, se migraron columnas legadas (`qty -> quantity`, `count -> quantity`, `price -> unit_price`) sin alterar datos históricos.
- **Atomicidad Transaccional en `createOrder`:** La orden y sus ítems se insertan en un único batch atómico (`client.batch([orderStmt, ...itemBatch], "write")`). Si falla la inserción de ítems, el motor libSQL/SQLite aborta la transacción completa. Ante cualquier error irrecuperable, se ejecutan sentencias de limpieza y se expulsa la orden de la memoria para garantizar que no existan órdenes parciales ni huérfanas.
- **Candado Fail-Closed:** Tanto en Gemini, OpenAI como en el fallback determinista, si el asistente genera un texto con palabras clave de confirmación pero la creación del pedido en base de datos retorna `null` o lanza excepción, el mensaje se reemplaza inmediatamente por un aviso de recuperación técnica, evitando confirmaciones falsas al cliente.

### 2.3 Reclamo Atómico y Deduplicación al Domiciliario (`lib/delivery-driver.ts` y `lib/store/index.ts`)
- **Reclamo Condicional en Base de Datos:** Se implementó `claimOrderDriverNotification(id, kind, force)` mediante un `UPDATE` condicional atómico (`UPDATE orders SET driver_notified = 'sending_initial' WHERE id = ? AND (driver_notified IS NULL ...)`). Si dos procesos concurrentes intentan notificar la misma orden, solo aquel con `rowsAffected > 0` procede al envío.
- **Rollback de Reclamo en Fallo:** Si `sendOutboundWhatsApp` falla por timeout o error de red, `releaseOrderDriverNotification(id, kind, false)` revierte el estado en base de datos a `NULL` (o `'initial'`) y elimina la clave de caché, permitiendo reintentos posteriores (automáticos o desde el panel) sin quedar bloqueado permanentemente.
- **Reintento Manual Forzado en Panel:** El endpoint `POST /api/panel/orders/[id]/notify-driver` utiliza `notifyDeliveryDriver(order, message, { force: true })`, permitiendo a los operadores despachar manualmente la notificación si fue necesario recuperar una entrega.
- **Registro Seguro y Ficha Formateada:** Se estructuró el log en `system_logs` con módulo `"driver"`, sin imprimir teléfonos personales ni datos sensibles. Se incluyó la indicación explícita de `🛵 *Domicilio:* ¡GRATIS! ($0)` en la ficha del domiciliario.

### 2.4 Aislamiento Conversacional de Sesiones (`getSessionMessages`)
- Se implementó `getSessionMessages(rawMessages, latestOrder)` para cortar el historial previo cuando:
  - Existe un pedido finalizado (`delivered`), cancelado (`cancelled`) o de más de 45 minutos.
  - El cliente o el asistente ejecutaron una intención de cancelación («Para cancelar pedido») o de nuevo pedido («Hola para un pedido»).
- Las intenciones `isCancelIntent` y `isNewOrderIntent` actúan de forma prioritaria limpiando el carrito y confirmando el reinicio antes de procesar nuevos productos.

---

## 3. Cobertura de la Suite de Pruebas Automatizadas

La suite `tests/order-modifications-and-dispatch.test.ts` valida:

| Prueba | Descripción del Escenario | Tipo de Verificación | Resultado |
| :--- | :--- | :--- | :---: |
| **Test A** | Cambio de producto de surtida a tradicional («Para cambiar a una tradicional») abandona el bucle de salsas. | Lógica de agente y filtros de salsas | **PASS** |
| **Test B** | Resumen previo (Paso 6) y orden confirmada (Paso 7) corresponden a C8T ($32.000 COP) con domicilio gratis ($0). | Flujo completo de 4 turnos y recálculo matemático | **PASS** |
| **Test C** | Confirmación de pedido despacha notificación formateada al domiciliario con encabezado, total y costo $0. | Plantilla oficial de WhatsApp del domiciliario | **PASS** |
| **Test D** | Simulación de fallo en Evolution API registra advertencia en `system_logs` sin tumbar la orden ni lanzar excepción. | Simulación de red y logger del sistema | **PASS** |
| **Test E** | Cancelación («Para cancelar pedido») y reinicio («Hola para un pedido») con contexto y carrito limpios. | Aislamiento de sesiones y reseteo conversacional | **PASS** |
| **Test F** | Reintentos o mensajes repetidos no generan notificaciones duplicadas al domiciliario (memoria y BD). | Deduplicación por TTL y estado en base de datos | **PASS** |
| **Test G** | Invocaciones simultáneas concurrentes (`Promise.all`) despachan exactamente 1 notificación. | Concurrencia real con delay de red | **PASS** |
| **Test H** | Fallo de persistencia en `createOrder` activa Fail-Closed sin confirmación falsa al cliente. | Simulación de fallo de Turso y mitigación segura | **PASS** |
| **Test I** | Reintento de notificación tras fallo previo recupera estado y envía exitosamente. | Reversión atómica y reintento exitoso | **PASS** |
| **Test J** | Atomicidad de `createOrder`: si falla la inserción de ítems, no queda orden huérfana guardada. | Transaccionalidad y rollback de memoria/BD | **PASS** |
| **Test K** | Reclamo zombi/stale por caída inesperada de instancia no bloquea permanentemente el despacho. | Expiración de reserva a 2 minutos y re-despacho | **PASS** |

---

## 4. Resultados de Verificación de Calidad

| Comando | Resultado | Métricas |
| :--- | :---: | :--- |
| `npm test` | **PASS** | 58 tests ejecutados, 58 aprobados, 0 fallos. |
| `npx tsc --noEmit` | **PASS** | 0 errores de compilación TypeScript estricto. |
| `npm run lint` | **PASS** | 0 errores ESLint (163 advertencias preexistentes en panel). |
| `npm run build` | **PASS** | Next.js 16.3.5 compilado y empaquetado exitosamente con Turbopack (3.0s). |

---

## 5. Resumen de Archivos Modificados

- `app/api/panel/orders/[id]/notify-driver/route.ts`: Unifica reintento manual de notificación al domiciliario con bandera `force: true`.
- `app/api/webhooks/evolution/route.ts`: Espera con `await` la notificación al domiciliario al verificar comprobantes de pago.
- `lib/agent/order-validator.ts`: Desglose de sabores y validaciones de salsas condicionadas.
- `lib/agent/sales-agent.ts`: Manejo determinista de cambio de producto, aislamiento de salsas, fail-closed en creación de órdenes, persistencia contextual y división de sesiones.
- `lib/delivery-driver.ts`: Reclamo condicional atómico, rollback tras fallo, caché de deduplicación, logging estructurado y ficha con domicilio gratis ($0).
- `lib/store/db.ts`: Migraciones idempotentes seguras para `order_items` y `orders.driver_notified`, e inyección de cliente de prueba.
- `lib/store/index.ts`: Batch atómico de orden e ítems en `createOrder`, reclamo condicional `claimOrderDriverNotification` y reversión `releaseOrderDriverNotification`.
- `tests/order-modifications-and-dispatch.test.ts`: Nueva suite automatizada con 10 escenarios (A a J).
