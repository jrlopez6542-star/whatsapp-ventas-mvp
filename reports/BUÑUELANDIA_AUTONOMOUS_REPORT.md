# INFORME DE AUDITORÍA AUTÓNOMA Y ENDURECIMIENTO DE SEGURIDAD
## Sistema de Ventas y Panel Administrativo — Buñuelandia (`whatsapp-ventas-mvp`)

**Fecha:** 16 de Octubre de 2026  
**Rama:** `fix/panel-auth-logout-security`  
**Estado:** ✅ APROBADO (Tests, Linter, Typecheck y Build)

---

## 1. Resumen Ejecutivo

Se completó la auditoría y corrección integral del sistema de autenticación, revocación persistente de sesiones y protección perimetral del panel administrativo de Buñuelandia. La solución resuelve de raíz los fallos de cierre de sesión, la reutilización de tokens en clientes y APIs, el blindaje criptográfico en Edge Middleware y la autorización definitiva en servidor (Node.js).

Se verificaron de manera estricta los 47 tests del proyecto, corrigiendo y ampliando las suites de seguridad `Seguridad E1` a `Seguridad E7` sin alterar el audio, la transcripción, la cobertura de domicilios ni los datos reales en producción.

Adicionalmente, se auditó y corrigió la obtención del secreto de firma en producción: se eliminó cualquier alternativa secundaria (`PANEL_PASSWORD`, `CRON_SECRET`, `EVOLUTION_API_KEY`), haciendo `PANEL_SESSION_SECRET` estricta y exclusivamente obligatorio en `lib/auth/session.ts` y `middleware.ts`.

---

## 2. Arquitectura de Autenticación y Corrección de Logout

### 2.1 Cierre de Sesión Efectivo y Atributos de Cookie
- **Ruta de Logout (`/api/panel/auth/logout`):**
  - Identifica y revoca tanto `panel_session` como `crm_session` de forma independiente si contienen valores distintos.
  - Persiste la revocación en Turso (`revoked_tokens`) con hash SHA-256 canónico (`canonicalTokenHash`).
  - Expira las cookies en el cliente emitiendo encabezados `Set-Cookie` con `Max-Age=0`, `Expires=Thu, 01 Jan 1970 00:00:00 GMT`, `Path=/`, `HttpOnly`, `SameSite=Lax`, y `Secure` condicionado al entorno.
- **Feedback Visual en Login (`/panel/login`):**
  - Muestra alertas específicas según el motivo de redirección:
    - `?logout=1`: Sesión finalizada exitosamente.
    - `?error=revoked`: Sesión revocada o cerrada remotamente.
    - `?error=invalid`: Firma adulterada o manipulada.
    - `?error=config`: Error de configuración de secreto en servidor.

### 2.2 Doble Barrera de Autorización (Edge Middleware + Server Component)
1. **Filtro Rápido en Edge (`middleware.ts`):**
   - Verifica el formato `rawToken.hmacSignature` y valida la firma criptográfica HMAC-SHA256 con Web Crypto API.
   - En APIs privadas (`/api/panel/*`), responde `401 Unauthorized` si no existe una firma válida.
   - En páginas privadas (`/panel`), redirige con `307 Temporary Redirect` hacia `/panel/login`.
   - Si no hay secreto configurado en producción (`NODE_ENV === "production"`), opera en modo **Fail-Closed** bloqueando el tráfico.
2. **Autorización Definitiva en Servidor (`app/panel/page.tsx` y `requirePanelAuth`):**
   - Se ejecuta en runtime `nodejs` con renderizado dinámico (`force-dynamic`).
   - Comprueba persistencia en base de datos: estado de revocación en `revoked_tokens`, expiración de la sesión en `user_sessions`, y vigencia del usuario (`user.active === 1`).
   - El panel se extrajo al componente cliente `PanelDashboard.tsx` preservando el 100% de las funciones: pedidos en tiempo real, chat en vivo, catálogo, configuración de negocio, sincronización QR de WhatsApp y logs.

### 2.3 Obligatoriedad Exclusiva de `PANEL_SESSION_SECRET`
- Tanto en `lib/auth/session.ts` (`getSessionSigningSecret`) como en `middleware.ts` (`getSigningSecret`), se eliminó cualquier fallback a secretos ajenos (`PANEL_PASSWORD`, `CRON_SECRET`, `EVOLUTION_API_KEY`).
- En producción (`process.env.NODE_ENV === "production"`), la ausencia de `PANEL_SESSION_SECRET` provoca un fallo Fail-Closed inmediato:
  - En Node.js: excepción de configuración impidiendo firmar o validar sesiones.
  - En Edge Middleware: retorno `null` provocando HTTP 401 en APIs y HTTP 307 hacia `/panel/login` en páginas privadas.
- En entornos locales o de test, se utiliza `PANEL_SESSION_SECRET` si existe, o una clave fija de desarrollo no productiva.

---

## 3. Cobertura y Verificación de Tests de Seguridad

### Seguridad E1: Expiración Desacoplada
- Se eliminó el uso de `globalThis.__memoryAuthStore` y se utilizó la función `setSessionExpiryForTesting`, compatible de forma nativa tanto con Turso como con el almacén en memoria.
- `validateSession` y `requirePanelAuth` rechazan sesiones caducadas.

### Seguridad E2: Firmas Adulteradas
- Rechazo determinista ante tokens con HMAC alterado o tokens crudos manipulados.
- Bloqueo 401 inmediato en Edge Middleware.

### Seguridad E3: Ausencia de Secreto en Producción, Sin Alternativas y Blindaje de Pruebas
- Se verifica que si `NODE_ENV === "production"`:
  - Si falta `PANEL_SESSION_SECRET`, `getSessionSigningSecret()` y `signToken()` lanzan excepciones de configuración.
  - `verifySignedToken()` retorna `null`.
  - `requirePanelAuth()` deniega acceso de forma segura (`authorized: false`).
  - `middleware()` retorna 401 en APIs y 307 en páginas privadas.
  - La presencia de `PANEL_PASSWORD`, `CRON_SECRET` o `EVOLUTION_API_KEY` **no se acepta como alternativa** en producción.
  - `setSessionExpiryForTesting()` lanza excepción bloqueando cualquier intento de manipulación en producción.
  - Al configurar `PANEL_SESSION_SECRET` en producción, el secreto es aceptado correctamente.

### Seguridad E4: Rechazo de Tokens Derivados de `PANEL_PASSWORD`
- Aislamiento completo con `try ... finally` y contraseña de prueba controlada.
- Comprueba que los tokens estáticos derivados de contraseñas sean rechazados en `panel_session`, `crm_session`, en peticiones de API (401) y en páginas privadas (307 redirect), garantizando que no existan vías alternativas de bypass.

### Seguridad E5: Gestión Dual de Cookies, Revocación y Firmas Forjadas
- Acceso permitido cuando ambas cookies son distintas y válidas.
- **Revocación cruzada:** Si cualquiera de las dos cookies (`panel_session` o `crm_session`) está revocada, el acceso se deniega inmediatamente (`authorized: false`, error de revocación).
- **Firmas forjadas:** Si cualquiera de las dos cookies presenta una firma HMAC inválida, `requirePanelAuth` y el middleware deniegan acceso inmediatamente con error de firma adulterada y código 401.

### Seguridad E6: Caducidad y Revocación Post-Activa
- Valida ambas combinaciones:
  - `panel_session` expirada + `crm_session` activa $\rightarrow$ autorizado.
  - `panel_session` activa + `crm_session` expirada $\rightarrow$ autorizado.
  - Ambas expiradas $\rightarrow$ denegado.
- Verifica que tras revocar una sesión previamente activa, esta sea rechazada de forma inmediata tanto en peticiones por `panel_session` como por `crm_session`.

### Seguridad E7: Auditoría de Todas las Rutas Privadas del Panel
Se verificó el rechazo de solicitudes no autenticadas (código previsto 401, o 403 para endpoints que validan rol administrador) en **las 27 operaciones reales de lectura y modificación**:
1. `GET /api/panel/auth/me` $\rightarrow$ 401
2. `GET /api/panel/conversations` $\rightarrow$ 401
3. `PATCH /api/panel/conversations/[id]` $\rightarrow$ 401
4. `DELETE /api/panel/conversations/[id]` $\rightarrow$ 401
5. `GET /api/panel/conversations/[id]/messages` $\rightarrow$ 401
6. `POST /api/panel/conversations/[id]/messages` $\rightarrow$ 401
7. `POST /api/panel/conversations/[id]/status` $\rightarrow$ 401
8. `GET /api/panel/orders` $\rightarrow$ 401
9. `PATCH /api/panel/orders/[id]` $\rightarrow$ 401
10. `DELETE /api/panel/orders/[id]` $\rightarrow$ 403 (candado de rol administrador)
11. `POST /api/panel/orders/[id]/notify-driver` $\rightarrow$ 401
12. `GET /api/panel/products` $\rightarrow$ 401
13. `POST /api/panel/products` $\rightarrow$ 401
14. `PATCH /api/panel/products/[sku]` $\rightarrow$ 401
15. `DELETE /api/panel/products/[sku]` $\rightarrow$ 401
16. `GET /api/panel/settings` $\rightarrow$ 401
17. `PUT /api/panel/settings` $\rightarrow$ 403 (candado de rol administrador)
18. `POST /api/panel/settings` $\rightarrow$ 403 (candado de rol administrador)
19. `GET /api/panel/users` $\rightarrow$ 403 (candado de rol administrador)
20. `POST /api/panel/users` $\rightarrow$ 403 (candado de rol administrador)
21. `PATCH /api/panel/users/[id]` $\rightarrow$ 403 (candado de rol administrador)
22. `DELETE /api/panel/users/[id]` $\rightarrow$ 403 (candado de rol administrador)
23. `GET /api/panel/logs` $\rightarrow$ 401
24. `DELETE /api/panel/logs` $\rightarrow$ 401
25. `GET /api/panel/test-ai` $\rightarrow$ 401
26. `GET /api/panel/whatsapp-qr` $\rightarrow$ 401
27. `POST /api/panel/whatsapp-qr` $\rightarrow$ 401

---

## 4. Resultados de Verificación de Calidad

| Comando | Resultado | Métricas |
| :--- | :---: | :--- |
| `npm test` | **PASS** | 47 tests ejecutados, 47 aprobados, 0 fallos. |
| `npx tsc --noEmit` | **PASS** | 0 errores de tipado TypeScript estricto. |
| `npm run lint` | **PASS** | 0 errores ESLint (161 advertencias menores previas). |
| `npm run build` | **PASS** | Next.js 16 compilado y empaquetado exitosamente. |

---

## 5. Riesgos Pendientes y Recomendaciones Operativas

1. **Configuración de Secreto en Vercel (`PANEL_SESSION_SECRET`):**
   - En producción, el sistema opera en modo Fail-Closed y ya no acepta claves alternativas. Es indispensable que `PANEL_SESSION_SECRET` esté configurada en las variables de entorno de producción de Vercel antes de desplegar.
2. **Despliegue a Producción:**
   - Mantener los cambios en la rama `fix/panel-auth-logout-security`. No realizar push a `main` ni despliegues directos sin validación final del operador humano.
