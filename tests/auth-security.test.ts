import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../lib/auth/passwords";
import {
  createUser,
  findUserByEmail,
  createSession,
  validateSession,
  revokeSession,
  updateUser,
} from "../lib/auth/session";

test("Criptografía: hashPassword y verifyPassword con scrypt", async () => {
  const plain = "MiClaveSuperSegura2026!";
  const hash = await hashPassword(plain);

  assert.ok(hash.startsWith("$scrypt$"), "El hash debe tener el prefijo $scrypt$");
  assert.notEqual(hash, plain, "La contraseña no debe estar en texto plano");

  // Verificación exitosa
  const valid = await verifyPassword(plain, hash);
  assert.equal(valid, true, "La contraseña correcta debe ser validada");

  // Verificación fallida con contraseña incorrecta
  const invalid = await verifyPassword("ClaveEquivocada", hash);
  assert.equal(invalid, false, "Una contraseña errónea debe ser rechazada");

  // Manejo de valores vacíos
  const emptyCheck = await verifyPassword("", hash);
  assert.equal(emptyCheck, false, "Una contraseña vacía debe ser rechazada");
});

test("Gestión de Usuarios: creación, consulta y actualización de rol", async () => {
  const testEmail = `operador_${Date.now()}@bunuelandia.co`;
  const created = await createUser({
    email: testEmail,
    password: "Password123*",
    name: "Carlos Operador",
    role: "operator",
    phone: "3001234567",
  });

  assert.ok(created.id, "Debe generar un ID de usuario");
  assert.equal(created.email, testEmail.toLowerCase());
  assert.equal(created.role, "operator");
  assert.equal(created.name, "Carlos Operador");
  assert.equal((created as unknown as { passwordHash?: string }).passwordHash, undefined, "No debe exponer el hash de contraseña en el objeto público");

  // Búsqueda por email
  const found = await findUserByEmail(testEmail);
  assert.ok(found, "Debe encontrar el usuario por email");
  assert.ok(found.passwordHash, "findUserByEmail interno debe incluir el hash para verificación");

  // Rechazo de emails duplicados
  await assert.rejects(
    async () => {
      await createUser({
        email: testEmail,
        password: "OtherPassword123*",
        name: "Carlos Duplicado",
        role: "operator",
      });
    },
    /Ya existe un usuario/i,
    "Debe rechazar la creación de usuarios con correo duplicado"
  );

  // Actualización de rol
  const updated = await updateUser(created.id, { role: "admin" });
  assert.ok(updated);
  assert.equal(updated.role, "admin", "El rol debe haberse actualizado a admin");
});

test("Gestión de Sesiones: ciclo de vida createSession -> validateSession -> revokeSession", async () => {
  const email = `driver_${Date.now()}@bunuelandia.co`;
  const user = await createUser({
    email,
    password: "Password123*",
    name: "Mario Domiciliario",
    role: "driver",
    phone: "3109876543",
  });

  // 1. Crear sesión
  const { token, rawToken, expiresAt } = await createSession(user.id, "Mozilla/5.0 Test", "127.0.0.1");
  assert.ok(token, "Debe retornar un token");
  assert.ok(token.includes("."), "El token retornado al cliente debe estar firmado con HMAC");
  assert.equal(rawToken.length, 64, "El rawToken interno debe ser de 64 caracteres hex");
  assert.ok(expiresAt > Date.now(), "La expiración debe ser futura");

  // 2. Validar sesión (tanto con token firmado como con rawToken)
  const sessionUser = await validateSession(token);
  assert.ok(sessionUser, "La sesión válida con token firmado debe resolver al usuario");
  assert.equal(sessionUser.id, user.id);
  assert.equal(sessionUser.role, "driver");

  const sessionUserRaw = await validateSession(rawToken);
  assert.ok(sessionUserRaw, "La sesión válida con rawToken también debe resolver al usuario");
  assert.equal(sessionUserRaw.id, user.id);

  // 3. Token manipulado, forjado o sin firma válida
  const fakeSession = await validateSession("0".repeat(64));
  assert.equal(fakeSession, null, "Un token inexistente debe retornar null");
  const forgedSession = await validateSession(`${"a".repeat(64)}.${"b".repeat(64)}`);
  assert.equal(forgedSession, null, "Un token con firma HMAC forjada debe retornar null");

  // 4. Revocar sesión (Logout)
  await revokeSession(token);
  const afterRevoke = await validateSession(token);
  assert.equal(afterRevoke, null, "Tras revocar la sesión, la validación debe retornar null");
});

test("Seguridad: Cambio de contraseña revoca sesiones previas", async () => {
  const email = `admin_test_${Date.now()}@bunuelandia.co`;
  const user = await createUser({
    email,
    password: "OldPassword123*",
    name: "Admin Seguridad",
    role: "admin",
  });

  // Sesión creada antes del cambio
  const { token } = await createSession(user.id);
  const validBefore = await validateSession(token);
  assert.ok(validBefore);

  // Actualizar contraseña
  await updateUser(user.id, { password: "NewPassword456*" });

  // La sesión antigua debe haber sido revocada automáticamente
  const validAfter = await validateSession(token);
  assert.equal(validAfter, null, "El cambio de contraseña debe invalidar sesiones previas");

  // La nueva contraseña debe funcionar
  const userWithPass = await findUserByEmail(email);
  assert.ok(userWithPass);
  const okNew = await verifyPassword("NewPassword456*", userWithPass.passwordHash);
  assert.equal(okNew, true, "La nueva contraseña debe ser válida");
  const okOld = await verifyPassword("OldPassword123*", userWithPass.passwordHash);
  assert.equal(okOld, false, "La contraseña vieja ya no debe ser válida");
});

test("Logout y Revocación: requirePanelAuth rechaza tokens revocados (panel_session y crm_session)", async () => {
  const { requirePanelAuth } = await import("../lib/auth/session");
  const { NextRequest } = await import("next/server");

  const email = `logout_user_${Date.now()}@bunuelandia.co`;
  const user = await createUser({
    email,
    password: "Password123*",
    name: "User Logout Test",
    role: "operator",
  });

  const { token } = await createSession(user.id);

  // 1. Antes de logout: acceso autorizado con panel_session
  const reqBefore = new NextRequest("http://localhost:3000/api/panel/orders", {
    headers: { cookie: `panel_session=${token}` },
  });
  const authBefore = await requirePanelAuth(reqBefore);
  assert.equal(authBefore.authorized, true);

  // 2. Antes de logout: acceso autorizado con crm_session
  const reqCrmBefore = new NextRequest("http://localhost:3000/api/panel/orders", {
    headers: { cookie: `crm_session=${token}` },
  });
  const authCrmBefore = await requirePanelAuth(reqCrmBefore);
  assert.equal(authCrmBefore.authorized, true);

  // 3. Ejecutar revocación (Logout)
  await revokeSession(token);

  // 4. Tras logout: acceso denegado con panel_session
  const reqAfter = new NextRequest("http://localhost:3000/api/panel/orders", {
    headers: { cookie: `panel_session=${token}` },
  });
  const authAfter = await requirePanelAuth(reqAfter);
  assert.equal(authAfter.authorized, false, "La cookie reutilizada tras logout debe ser rechazada");

  // 5. Tras logout: acceso denegado con crm_session
  const reqCrmAfter = new NextRequest("http://localhost:3000/api/panel/orders", {
    headers: { cookie: `crm_session=${token}` },
  });
  const authCrmAfter = await requirePanelAuth(reqCrmAfter);
  assert.equal(authCrmAfter.authorized, false, "crm_session reutilizada tras logout debe ser rechazada");
});

test("Seguridad D1: Login válido, inválido, contraseña exacta y bloqueo 403 de usuario inactivo", async () => {
  const { POST: loginPOST } = await import("../app/api/panel/auth/login/route");
  const { NextRequest } = await import("next/server");

  // 1. Usuario activo con contraseña con caracteres especiales y espacios
  const activeEmail = `active_user_${Date.now()}@bunuelandia.co`;
  const exactPass = ' Clave"Segura"&2026! ';
  await createUser({
    email: activeEmail,
    password: exactPass,
    name: "Usuario Activo",
    role: "operator",
  });

  // Login exitoso con contraseña exacta
  const validReq = new NextRequest("http://localhost:3000/api/panel/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: activeEmail, password: exactPass }),
  });
  const validRes = await loginPOST(validReq);
  assert.equal(validRes.status, 200, "Login con credenciales correctas debe responder 200");
  const validData = await validRes.json();
  assert.equal(validData.ok, true);
  assert.equal(validData.user.email, activeEmail.toLowerCase());

  // Verificación de cookies emitidas
  const cookiesHeader = validRes.headers.get("set-cookie") || "";
  assert.ok(cookiesHeader.includes("panel_session="), "Debe emitir cookie panel_session");
  assert.ok(cookiesHeader.includes("crm_session="), "Debe emitir cookie crm_session");

  // Login fallido con contraseña incorrecta
  const invalidReq = new NextRequest("http://localhost:3000/api/panel/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: activeEmail, password: "PasswordErrada999!" }),
  });
  const invalidRes = await loginPOST(invalidReq);
  assert.equal(invalidRes.status, 401, "Login con contraseña errada debe responder 401");
  const invalidData = await invalidRes.json();
  assert.equal(invalidData.ok, false);

  // 2. Usuario inactivo/suspendido: DEBE responder 403 Forbidden
  const inactiveEmail = `inactive_user_${Date.now()}@bunuelandia.co`;
  const inactiveUser = await createUser({
    email: inactiveEmail,
    password: "Password123*",
    name: "Usuario Suspendido",
    role: "operator",
  });
  await updateUser(inactiveUser.id, { active: false });

  const inactiveReq = new NextRequest("http://localhost:3000/api/panel/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: inactiveEmail, password: "Password123*" }),
  });
  const inactiveRes = await loginPOST(inactiveReq);
  assert.equal(inactiveRes.status, 403, "Usuario inactivo debe ser rechazado estrictamente con 403");
  const inactiveData = await inactiveRes.json();
  assert.equal(inactiveData.ok, false);
  assert.match(inactiveData.error, /inactivo o suspendido/i);
});

test("Seguridad D2: Logout con cada cookie por separado, con cookies idénticas y con cookies distintas", async () => {
  const { POST: logoutPOST } = await import("../app/api/panel/auth/logout/route");
  const { NextRequest } = await import("next/server");

  const email = `logout_multi_${Date.now()}@bunuelandia.co`;
  const user = await createUser({
    email,
    password: "Password123*",
    name: "User Multi Logout",
    role: "operator",
  });

  // Caso 1: Solo panel_session
  const s1 = await createSession(user.id);
  const req1 = new NextRequest("http://localhost:3000/api/panel/auth/logout", {
    method: "POST",
    headers: { cookie: `panel_session=${s1.token}` },
  });
  const res1 = await logoutPOST(req1);
  assert.equal(res1.status, 200);
  assert.equal(await validateSession(s1.token), null, "s1 debe quedar revocado");

  // Caso 2: Solo crm_session
  const s2 = await createSession(user.id);
  const req2 = new NextRequest("http://localhost:3000/api/panel/auth/logout", {
    method: "POST",
    headers: { cookie: `crm_session=${s2.token}` },
  });
  const res2 = await logoutPOST(req2);
  assert.equal(res2.status, 200);
  assert.equal(await validateSession(s2.token), null, "s2 debe quedar revocado");

  // Caso 3: Cookies idénticas (panel_session y crm_session con el mismo token)
  const s3 = await createSession(user.id);
  const req3 = new NextRequest("http://localhost:3000/api/panel/auth/logout", {
    method: "POST",
    headers: { cookie: `panel_session=${s3.token}; crm_session=${s3.token}` },
  });
  const res3 = await logoutPOST(req3);
  assert.equal(res3.status, 200);
  assert.equal(await validateSession(s3.token), null, "s3 debe quedar revocado");

  // Caso 4: Cookies distintas (panel_session y crm_session con tokens DIFERENTES)
  const s4 = await createSession(user.id);
  const s5 = await createSession(user.id);
  const req4 = new NextRequest("http://localhost:3000/api/panel/auth/logout", {
    method: "POST",
    headers: { cookie: `panel_session=${s4.token}; crm_session=${s5.token}` },
  });
  const res4 = await logoutPOST(req4);
  assert.equal(res4.status, 200);

  // AMBOS tokens válidos distintos DEBEN haber sido revocados
  assert.equal(await validateSession(s4.token), null, "Token de panel_session debe quedar revocado");
  assert.equal(await validateSession(s5.token), null, "Token de crm_session debe quedar revocado");

  // Atributos de expiración de cookies en la respuesta
  const setCookieHeader = res4.headers.get("set-cookie") || "";
  assert.ok(setCookieHeader.includes("Max-Age=0"), "Debe indicar Max-Age=0");
  assert.ok(setCookieHeader.includes("Path=/"), "Debe especificar Path=/");
});

test("Seguridad D3 & D6: Bloqueo de API privadas y rechazo de cookie reutilizada tras logout", async () => {
  const { POST: logoutPOST } = await import("../app/api/panel/auth/logout/route");
  const { GET: meGET } = await import("../app/api/panel/auth/me/route");
  const { GET: ordersGET } = await import("../app/api/panel/orders/route");
  const { GET: productsGET } = await import("../app/api/panel/products/route");
  const { NextRequest } = await import("next/server");

  const email = `api_guard_${Date.now()}@bunuelandia.co`;
  const user = await createUser({
    email,
    password: "Password123*",
    name: "API Guard User",
    role: "admin",
  });

  const { token } = await createSession(user.id);

  // 1. Acceso a APIs privadas con sesión válida ANTES de logout
  const meBefore = await meGET(
    new NextRequest("http://localhost:3000/api/panel/auth/me", {
      headers: { cookie: `panel_session=${token}` },
    })
  );
  assert.equal(meBefore.status, 200, "/api/panel/auth/me debe permitir acceso");

  const ordersBefore = await ordersGET(
    new NextRequest("http://localhost:3000/api/panel/orders", {
      headers: { cookie: `panel_session=${token}` },
    })
  );
  assert.equal(ordersBefore.status, 200, "/api/panel/orders debe permitir acceso");

  // 2. Ejecutar logout
  const logoutRes = await logoutPOST(
    new NextRequest("http://localhost:3000/api/panel/auth/logout", {
      method: "POST",
      headers: { cookie: `panel_session=${token}` },
    })
  );
  assert.equal(logoutRes.status, 200);

  // 3. Intento de reutilizar la cookie vieja en APIs privadas DESPUÉS del logout
  const meAfter = await meGET(
    new NextRequest("http://localhost:3000/api/panel/auth/me", {
      headers: { cookie: `panel_session=${token}` },
    })
  );
  assert.equal(meAfter.status, 401, "/api/panel/auth/me debe rechazar la cookie reutilizada con 401");

  const ordersAfter = await ordersGET(
    new NextRequest("http://localhost:3000/api/panel/orders", {
      headers: { cookie: `panel_session=${token}` },
    })
  );
  assert.equal(ordersAfter.status, 401, "/api/panel/orders debe rechazar la cookie reutilizada con 401");

  const productsAfter = await productsGET(
    new NextRequest("http://localhost:3000/api/panel/products", {
      headers: { cookie: `panel_session=${token}` },
    })
  );
  assert.equal(productsAfter.status, 401, "/api/panel/products debe rechazar la cookie reutilizada con 401");
});

test("Seguridad D4 & D5: Hash canónico unificado y resiliencia Fail-Closed ante fallos de persistencia", async () => {
  const { canonicalTokenHash, isTokenRevoked, createSession } = await import("../lib/auth/session");

  // 1. Unicidad del hash canónico: rawToken vs signedToken producen exactamente el mismo hash
  const { token: signedToken, rawToken } = await createSession("usr_dummy");
  const hashFromSigned = canonicalTokenHash(signedToken);
  const hashFromRaw = canonicalTokenHash(rawToken);

  assert.ok(hashFromSigned.length === 64);
  assert.equal(
    hashFromSigned,
    hashFromRaw,
    "El hash canónico de un token firmado debe coincidir exactamente con el de su rawToken"
  );

  // 2. Fail-Closed: isTokenRevoked con hash vacío no arroja error pero no revoca
  assert.equal(await isTokenRevoked(""), false);
});

test("Seguridad D7: Nuevo login posterior al logout funciona correctamente", async () => {
  const { POST: loginPOST } = await import("../app/api/panel/auth/login/route");
  const { POST: logoutPOST } = await import("../app/api/panel/auth/logout/route");
  const { GET: meGET } = await import("../app/api/panel/auth/me/route");
  const { NextRequest } = await import("next/server");

  const email = `relogin_${Date.now()}@bunuelandia.co`;
  const pass = "SuperPassword2026!";
  await createUser({
    email,
    password: pass,
    name: "Relogin User",
    role: "operator",
  });

  // Primer login
  const log1 = await loginPOST(
    new NextRequest("http://localhost:3000/api/panel/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: pass }),
    })
  );
  assert.equal(log1.status, 200);
  const cookie1 = log1.headers.get("set-cookie") || "";
  const match1 = cookie1.match(/panel_session=([^;]+)/);
  assert.ok(match1);
  const token1 = match1[1];

  // Logout del primer login
  const out1 = await logoutPOST(
    new NextRequest("http://localhost:3000/api/panel/auth/logout", {
      method: "POST",
      headers: { cookie: `panel_session=${token1}` },
    })
  );
  assert.equal(out1.status, 200);

  // Comprobar que token1 quedó revocado
  const meRevoked = await meGET(
    new NextRequest("http://localhost:3000/api/panel/auth/me", {
      headers: { cookie: `panel_session=${token1}` },
    })
  );
  assert.equal(meRevoked.status, 401);

  // Segundo login: nuevo login exitoso
  const log2 = await loginPOST(
    new NextRequest("http://localhost:3000/api/panel/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: pass }),
    })
  );
  assert.equal(log2.status, 200);
  const cookie2 = log2.headers.get("set-cookie") || "";
  const match2 = cookie2.match(/panel_session=([^;]+)/);
  assert.ok(match2);
  const token2 = match2[1];

  assert.notEqual(token1, token2, "El nuevo login debe generar un token completamente nuevo e independiente");

  // El nuevo token debe permitir acceder a las rutas privadas
  const meActive = await meGET(
    new NextRequest("http://localhost:3000/api/panel/auth/me", {
      headers: { cookie: `panel_session=${token2}` },
    })
  );
  assert.equal(meActive.status, 200);
  const meData = await meActive.json();
  assert.equal(meData.ok, true);
  assert.equal(meData.user.email, email.toLowerCase());
});

test("Seguridad E1: Sesión expirada es rechazada en validateSession y requirePanelAuth", async () => {
  const { createSession, validateSession, requirePanelAuth, setSessionExpiryForTesting } = await import("../lib/auth/session");
  const { NextRequest } = await import("next/server");

  const email = `expired_test_${Date.now()}@bunuelandia.co`;
  const user = await createUser({
    email,
    password: "Password123*",
    name: "User Expired",
    role: "operator",
  });

  const { token } = await createSession(user.id);

  // Modificar la expiración con helper agnóstico al almacenamiento (Turso y memoria)
  await setSessionExpiryForTesting(token, Date.now() - 5000);

  // 1. validateSession debe retornar null para la sesión expirada
  const valid = await validateSession(token);
  assert.equal(valid, null, "Sesión con expiración vencida debe retornar null");

  // 2. requirePanelAuth debe responder authorized: false
  const req = new NextRequest("http://localhost:3000/api/panel/orders", {
    headers: { cookie: `panel_session=${token}` },
  });
  const auth = await requirePanelAuth(req);
  assert.equal(auth.authorized, false, "requirePanelAuth debe denegar acceso a sesiones vencidas");
  assert.match(auth.error || "", /expirada/i);
});

test("Seguridad E2: Firmas falsas y tokens manipulados son rechazados de forma determinista", async () => {
  const { createSession, validateSession, requirePanelAuth, canonicalTokenHash } = await import("../lib/auth/session");
  const { middleware } = await import("../middleware");
  const { NextRequest } = await import("next/server");

  const email = `tamper_${Date.now()}@bunuelandia.co`;
  const user = await createUser({
    email,
    password: "Password123*",
    name: "Tamper User",
    role: "operator",
  });

  const { token, rawToken } = await createSession(user.id);
  const [_actualRaw, actualSig] = token.split(".");

  // 1. rawToken alterado con firma original
  const forgedRawToken = "f".repeat(64) + "." + actualSig;
  assert.equal(canonicalTokenHash(forgedRawToken), "", "canonicalTokenHash debe retornar vacio para firmas adulteradas");
  assert.equal(await validateSession(forgedRawToken), null, "validateSession debe rechazar rawToken adulterado");

  // 2. rawToken original con firma falsa
  const forgedSigToken = rawToken + "." + "0".repeat(64);
  assert.equal(canonicalTokenHash(forgedSigToken), "", "canonicalTokenHash debe retornar vacio para firmas forjadas");
  assert.equal(await validateSession(forgedSigToken), null, "validateSession debe rechazar firma HMAC forjada");

  // 3. requirePanelAuth debe denegar acceso
  const reqForged = new NextRequest("http://localhost:3000/api/panel/orders", {
    headers: { cookie: `panel_session=${forgedSigToken}` },
  });
  const authForged = await requirePanelAuth(reqForged);
  assert.equal(authForged.authorized, false, "requirePanelAuth debe rechazar firmas HMAC inválidas");

  // 4. Edge Middleware debe interceptar y bloquear la firma forjada
  const midReq = new NextRequest("http://localhost:3000/api/panel/orders", {
    headers: { cookie: `panel_session=${forgedSigToken}` },
  });
  const midRes = await middleware(midReq);
  assert.equal(midRes.status, 401, "Middleware debe retornar 401 ante tokens con firma adulterada");
});

test("Seguridad E3: Ausencia de secreto de firma en producción falla de forma segura", async () => {
  const { getSessionSigningSecret, verifySignedToken, signToken, requirePanelAuth, setSessionExpiryForTesting } = await import("../lib/auth/session");
  const { middleware } = await import("../middleware");
  const { NextRequest } = await import("next/server");

  const originalEnv = { ...process.env };

  try {
    (process.env as any).NODE_ENV = "production";
    delete process.env.PANEL_SESSION_SECRET;
    delete process.env.PANEL_PASSWORD;
    delete process.env.CRON_SECRET;
    delete process.env.EVOLUTION_API_KEY;

    // 1. En producción, getSessionSigningSecret DEBE lanzar error de configuración
    assert.throws(
      () => {
        getSessionSigningSecret();
      },
      /secreto de firma de sesión en producción/i,
      "Debe lanzar excepción segura si falta el secreto en producción"
    );

    // 2. signToken debe lanzar excepción por falta de secreto en producción
    assert.throws(
      () => {
        signToken("0".repeat(64));
      },
      /secreto de firma de sesión en producción/i,
      "signToken debe lanzar excepción si falta el secreto en producción"
    );

    // 3. verifySignedToken debe fallar de forma segura retornando null
    const res = verifySignedToken(`${"a".repeat(64)}.${"b".repeat(64)}`);
    assert.equal(res, null, "verifySignedToken debe retornar null si no hay secreto en producción");

    // 4. requirePanelAuth debe fallar de forma segura ante cualquier token
    const testReq = new NextRequest("http://localhost:3000/api/panel/orders", {
      headers: { cookie: `panel_session=${"a".repeat(64)}.${"b".repeat(64)}` },
    });
    const authRes = await requirePanelAuth(testReq);
    assert.equal(authRes.authorized, false, "requirePanelAuth debe denegar acceso cuando falta secreto en producción");

    // 5. Edge Middleware debe responder 401 en APIs y 307 en páginas privadas cuando falta el secreto en producción
    const midApiRes = await middleware(testReq);
    assert.equal(midApiRes.status, 401, "Middleware debe retornar 401 en API si falta secreto en producción");

    const midPageReq = new NextRequest("http://localhost:3000/panel", {
      headers: { cookie: `panel_session=${"a".repeat(64)}.${"b".repeat(64)}` },
    });
    const midPageRes = await middleware(midPageReq);
    assert.equal(midPageRes.status, 307, "Middleware debe redirigir a login si falta secreto en producción");

    // 6. setSessionExpiryForTesting DEBE ser bloqueado estrictamente en producción
    await assert.rejects(
      async () => {
        await setSessionExpiryForTesting("dummy_token", Date.now());
      },
      /no está permitido en entornos de producción/i,
      "setSessionExpiryForTesting debe rechazar su uso en producción para impedir manipulación de sesiones"
    );
  } finally {
    process.env = originalEnv;
  }
});

test("Seguridad E4: Tokens legados derivados de PANEL_PASSWORD son rechazados (sin eludir revocación)", async () => {
  const { requirePanelAuth } = await import("../lib/auth/session");
  const { middleware } = await import("../middleware");
  const { NextRequest } = await import("next/server");
  const { createHash } = await import("crypto");

  const originalPanelPassword = process.env.PANEL_PASSWORD;
  const isolatedPassword = "IsolatedStaticPassword2026!#$";

  try {
    // Aislar explícitamente el entorno para la prueba
    process.env.PANEL_PASSWORD = isolatedPassword;
    const legacyStaticToken = createHash("sha256").update(`whatsapp-ventas-panel:${isolatedPassword}`).digest("hex");

    // 1. requirePanelAuth debe rechazar el token estático derivado de la contraseña en panel_session
    const reqPanel = new NextRequest("http://localhost:3000/api/panel/orders", {
      headers: { cookie: `panel_session=${legacyStaticToken}` },
    });
    const authPanel = await requirePanelAuth(reqPanel);
    assert.equal(authPanel.authorized, false, "requirePanelAuth debe rechazar token estático en panel_session");

    // 2. requirePanelAuth debe rechazar el token estático en crm_session
    const reqCrm = new NextRequest("http://localhost:3000/api/panel/orders", {
      headers: { cookie: `crm_session=${legacyStaticToken}` },
    });
    const authCrm = await requirePanelAuth(reqCrm);
    assert.equal(authCrm.authorized, false, "requirePanelAuth debe rechazar token estático en crm_session");

    // 3. requirePanelAuth debe rechazar si ambas cookies contienen el token estático
    const reqBoth = new NextRequest("http://localhost:3000/api/panel/orders", {
      headers: { cookie: `panel_session=${legacyStaticToken}; crm_session=${legacyStaticToken}` },
    });
    const authBoth = await requirePanelAuth(reqBoth);
    assert.equal(authBoth.authorized, false, "requirePanelAuth debe rechazar si ambas cookies son estáticas");

    // 4. Middleware debe rechazar con 401 en endpoints de API para panel_session
    const midReqApiPanel = new NextRequest("http://localhost:3000/api/panel/orders", {
      headers: { cookie: `panel_session=${legacyStaticToken}` },
    });
    const midResApiPanel = await middleware(midReqApiPanel);
    assert.equal(midResApiPanel.status, 401, "Middleware debe responder 401 a API con token legado en panel_session");

    // 5. Middleware debe rechazar con 401 en endpoints de API para crm_session
    const midReqApiCrm = new NextRequest("http://localhost:3000/api/panel/orders", {
      headers: { cookie: `crm_session=${legacyStaticToken}` },
    });
    const midResApiCrm = await middleware(midReqApiCrm);
    assert.equal(midResApiCrm.status, 401, "Middleware debe responder 401 a API con token legado en crm_session");

    // 6. Middleware debe redirigir a login (307) en páginas privadas (/panel) ante tokens legados
    const midReqPage = new NextRequest("http://localhost:3000/panel", {
      headers: { cookie: `panel_session=${legacyStaticToken}` },
    });
    const midResPage = await middleware(midReqPage);
    assert.equal(midResPage.status, 307, "Middleware debe redirigir páginas privadas a login ante tokens legados");
    assert.ok(midResPage.headers.get("location")?.includes("/panel/login"));

    // 7. Si PANEL_PASSWORD no coincide o no existe, el token legado sigue siendo rechazado
    delete process.env.PANEL_PASSWORD;
    const authNoEnv = await requirePanelAuth(reqPanel);
    assert.equal(authNoEnv.authorized, false, "requirePanelAuth debe rechazar token estático aun sin PANEL_PASSWORD");
  } finally {
    if (originalPanelPassword !== undefined) {
      process.env.PANEL_PASSWORD = originalPanelPassword;
    } else {
      delete process.env.PANEL_PASSWORD;
    }
  }
});

test("Seguridad E5: Gestión de dos cookies (panel_session y crm_session) con valores distintos, firmas inválidas y revocación", async () => {
  const { createSession, revokeSession, requirePanelAuth } = await import("../lib/auth/session");
  const { middleware } = await import("../middleware");
  const { NextRequest } = await import("next/server");

  const email1 = `multi_a_${Date.now()}@bunuelandia.co`;
  const user1 = await createUser({
    email: email1,
    password: "Password123*",
    name: "User Multi A",
    role: "operator",
  });

  const email2 = `multi_b_${Date.now()}@bunuelandia.co`;
  const user2 = await createUser({
    email: email2,
    password: "Password123*",
    name: "User Multi B",
    role: "operator",
  });

  const s1 = await createSession(user1.id);
  const s2 = await createSession(user2.id);

  // 1. Ambas cookies son válidas y distintas -> Acceso permitido
  const reqBothValid = new NextRequest("http://localhost:3000/api/panel/orders", {
    headers: { cookie: `panel_session=${s1.token}; crm_session=${s2.token}` },
  });
  const authBoth = await requirePanelAuth(reqBothValid);
  assert.equal(authBoth.authorized, true, "Ambas cookies válidas permiten acceso");

  // 2. Revocar la segunda cookie (crm_session):
  // Si crm_session está revocada aunque panel_session sea válida, DEBE ser rechazada de inmediato
  await revokeSession(s2.token);

  const reqWithRevokedCrm = new NextRequest("http://localhost:3000/api/panel/orders", {
    headers: { cookie: `panel_session=${s1.token}; crm_session=${s2.token}` },
  });
  const authBlockedCrm = await requirePanelAuth(reqWithRevokedCrm);
  assert.equal(authBlockedCrm.authorized, false, "Si crm_session está revocada, el acceso debe denegarse aunque panel_session sea válida");
  assert.match(authBlockedCrm.error || "", /revocada/i);

  // 3. Crear sesiones para probar la combinación inversa (panel_session revocada, crm_session válida)
  const s3 = await createSession(user1.id);
  const s4 = await createSession(user2.id);
  await revokeSession(s3.token); // Revocar panel_session

  const reqWithRevokedPanel = new NextRequest("http://localhost:3000/api/panel/orders", {
    headers: { cookie: `panel_session=${s3.token}; crm_session=${s4.token}` },
  });
  const authBlockedPanel = await requirePanelAuth(reqWithRevokedPanel);
  assert.equal(authBlockedPanel.authorized, false, "Si panel_session está revocada, el acceso debe denegarse aunque crm_session sea válida");
  assert.match(authBlockedPanel.error || "", /revocada/i);

  // 4. Si ambas cookies están revocadas -> Acceso denegado
  const reqBothRevoked = new NextRequest("http://localhost:3000/api/panel/orders", {
    headers: { cookie: `panel_session=${s3.token}; crm_session=${s2.token}` },
  });
  const authBothRevoked = await requirePanelAuth(reqBothRevoked);
  assert.equal(authBothRevoked.authorized, false, "Ambas cookies revocadas deben denegar acceso");

  // 5. Firma inválida o forjada:
  const forgedToken = "f".repeat(64) + "." + "0".repeat(64);

  // 5a. panel_session válida + crm_session forjada -> requirePanelAuth debe rechazar por firma adulterada
  const reqForgedCrm = new NextRequest("http://localhost:3000/api/panel/orders", {
    headers: { cookie: `panel_session=${s4.token}; crm_session=${forgedToken}` },
  });
  const authForgedCrm = await requirePanelAuth(reqForgedCrm);
  assert.equal(authForgedCrm.authorized, false, "requirePanelAuth debe rechazar si crm_session tiene firma forjada");
  assert.match(authForgedCrm.error || "", /firma.*inválida|adulterada/i);

  // 5b. panel_session forjada + crm_session válida -> requirePanelAuth debe rechazar por firma adulterada
  const reqForgedPanel = new NextRequest("http://localhost:3000/api/panel/orders", {
    headers: { cookie: `panel_session=${forgedToken}; crm_session=${s4.token}` },
  });
  const authForgedPanel = await requirePanelAuth(reqForgedPanel);
  assert.equal(authForgedPanel.authorized, false, "requirePanelAuth debe rechazar si panel_session tiene firma forjada");
  assert.match(authForgedPanel.error || "", /firma.*inválida|adulterada/i);

  // 6. Middleware para APIs ante firmas inválidas en cualquiera de las cookies
  const midReqForgedCrm = new NextRequest("http://localhost:3000/api/panel/orders", {
    headers: { cookie: `panel_session=${s4.token}; crm_session=${forgedToken}` },
  });
  const midResForgedCrm = await middleware(midReqForgedCrm);
  assert.equal(midResForgedCrm.status, 401, "Middleware debe retornar 401 ante crm_session con firma adulterada");

  const midReqForgedPanel = new NextRequest("http://localhost:3000/api/panel/orders", {
    headers: { cookie: `panel_session=${forgedToken}; crm_session=${s4.token}` },
  });
  const midResForgedPanel = await middleware(midReqForgedPanel);
  assert.equal(midResForgedPanel.status, 401, "Middleware debe retornar 401 ante panel_session con firma adulterada");

  // 7. Middleware para páginas privadas (/panel) ante firmas forjadas -> Redirección 307 a /panel/login
  const midReqPageForged = new NextRequest("http://localhost:3000/panel", {
    headers: { cookie: `panel_session=${forgedToken}; crm_session=${s4.token}` },
  });
  const midResPageForged = await middleware(midReqPageForged);
  assert.equal(midResPageForged.status, 307, "Middleware debe redirigir a login ante cookies con firma forjada");
  assert.ok(midResPageForged.headers.get("location")?.includes("/panel/login"));
});

test("Seguridad E6: Dos cookies con una caducada y otra activa en ambas combinaciones, ambas caducadas y revocación", async () => {
  const { createSession, revokeSession, validateSession, requirePanelAuth, setSessionExpiryForTesting } = await import("../lib/auth/session");
  const { NextRequest } = await import("next/server");

  const emailA = `active_cookie_${Date.now()}@bunuelandia.co`;
  const userA = await createUser({
    email: emailA,
    password: "Password123*",
    name: "User Active Cookie",
    role: "operator",
  });

  const emailB = `expired_cookie_${Date.now()}@bunuelandia.co`;
  const userB = await createUser({
    email: emailB,
    password: "Password123*",
    name: "User Expired Cookie",
    role: "operator",
  });

  const activeSess = await createSession(userA.id);
  const expiredSess = await createSession(userB.id);

  // Caducar de forma aislada e independiente del almacenamiento (Turso y memoria)
  await setSessionExpiryForTesting(expiredSess.token, Date.now() - 10000);

  // Validaciones directas de expiración
  assert.equal(await validateSession(expiredSess.token), null, "validateSession debe retornar null para expiredSess");
  const validUserA = await validateSession(activeSess.token);
  assert.ok(validUserA, "validateSession debe retornar usuario para activeSess");
  assert.equal(validUserA.id, userA.id);

  // Combinación 1: panel_session caducada y crm_session activa
  const req1 = new NextRequest("http://localhost:3000/api/panel/orders", {
    headers: { cookie: `panel_session=${expiredSess.token}; crm_session=${activeSess.token}` },
  });
  const auth1 = await requirePanelAuth(req1);
  assert.equal(auth1.authorized, true, "Si panel_session caducó pero crm_session sigue activa, debe autorizar");
  assert.equal(auth1.user?.id, userA.id);

  // Combinación 2: panel_session activa y crm_session caducada
  const req2 = new NextRequest("http://localhost:3000/api/panel/orders", {
    headers: { cookie: `panel_session=${activeSess.token}; crm_session=${expiredSess.token}` },
  });
  const auth2 = await requirePanelAuth(req2);
  assert.equal(auth2.authorized, true, "Si panel_session está activa y crm_session caducó, debe autorizar");
  assert.equal(auth2.user?.id, userA.id);

  // Ambas sesiones caducadas:
  await setSessionExpiryForTesting(activeSess.token, Date.now() - 10000);
  const reqBothExpired = new NextRequest("http://localhost:3000/api/panel/orders", {
    headers: { cookie: `panel_session=${expiredSess.token}; crm_session=${activeSess.token}` },
  });
  const authBothExpired = await requirePanelAuth(reqBothExpired);
  assert.equal(authBothExpired.authorized, false, "Ambas sesiones caducadas deben ser denegadas con authorized: false");
  assert.match(authBothExpired.error || "", /expirada|inválida/i);

  // Rechazo tras revocar una sesión que antes era válida
  const freshSess = await createSession(userA.id);
  const reqFresh = new NextRequest("http://localhost:3000/api/panel/orders", {
    headers: { cookie: `panel_session=${freshSess.token}` },
  });
  const authFreshBefore = await requirePanelAuth(reqFresh);
  assert.equal(authFreshBefore.authorized, true, "La sesión fresca debe ser válida antes de la revocación");

  // Revocar la sesión
  await revokeSession(freshSess.token);

  // Debe ser rechazada inmediatamente tanto en panel_session como en crm_session
  const authFreshAfterPanel = await requirePanelAuth(reqFresh);
  assert.equal(authFreshAfterPanel.authorized, false, "La sesión revocada debe ser rechazada de inmediato en panel_session");
  assert.match(authFreshAfterPanel.error || "", /revocada/i);

  const reqFreshCrm = new NextRequest("http://localhost:3000/api/panel/orders", {
    headers: { cookie: `crm_session=${freshSess.token}` },
  });
  const authFreshAfterCrm = await requirePanelAuth(reqFreshCrm);
  assert.equal(authFreshAfterCrm.authorized, false, "La sesión revocada debe ser rechazada de inmediato en crm_session");
  assert.match(authFreshAfterCrm.error || "", /revocada/i);
});

test("Seguridad E7: Todas las rutas privadas reales del panel rechazan solicitudes no autenticadas (lectura y modificación)", async () => {
  const { NextRequest } = await import("next/server");
  const { middleware } = await import("../middleware");

  // 1. Auth Me
  const { GET: getMe } = await import("../app/api/panel/auth/me/route");
  // 2. Conversations
  const { GET: getConvs } = await import("../app/api/panel/conversations/route");
  const { PATCH: patchConv, DELETE: deleteConv } = await import("../app/api/panel/conversations/[id]/route");
  const { GET: getConvMessages, POST: postConvMessages } = await import("../app/api/panel/conversations/[id]/messages/route");
  const { POST: postConvStatus } = await import("../app/api/panel/conversations/[id]/status/route");
  // 3. Orders
  const { GET: getOrders } = await import("../app/api/panel/orders/route");
  const { PATCH: patchOrder, DELETE: deleteOrder } = await import("../app/api/panel/orders/[id]/route");
  const { POST: postNotifyDriver } = await import("../app/api/panel/orders/[id]/notify-driver/route");
  // 4. Products
  const { GET: getProducts, POST: postProducts } = await import("../app/api/panel/products/route");
  const { PATCH: patchProduct, DELETE: deleteProduct } = await import("../app/api/panel/products/[sku]/route");
  // 5. Settings
  const { GET: getSettings, PUT: putSettings, POST: postSettings } = await import("../app/api/panel/settings/route");
  // 6. Users
  const { GET: getUsers, POST: postUsers } = await import("../app/api/panel/users/route");
  const { PATCH: patchUser, DELETE: deleteUserRoute } = await import("../app/api/panel/users/[id]/route");
  // 7. Logs
  const { GET: getLogs, DELETE: deleteLogs } = await import("../app/api/panel/logs/route");
  // 8. Test AI
  const { GET: getTestAi } = await import("../app/api/panel/test-ai/route");
  // 9. WhatsApp QR
  const { GET: getWhatsAppQr, POST: postWhatsAppQr } = await import("../app/api/panel/whatsapp-qr/route");

  const unauthReq = (url: string, method = "GET", body?: any) =>
    new NextRequest(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });

  const dummyParams = { params: Promise.resolve({ id: "isolated-test-id", sku: "TEST-SKU" }) };

  // Controladores de lectura (GET) sin cookies
  const meRes = await getMe(unauthReq("http://localhost:3000/api/panel/auth/me"));
  assert.equal(meRes.status, 401, "GET /api/panel/auth/me debe retornar 401");

  const convsRes = await getConvs(unauthReq("http://localhost:3000/api/panel/conversations"));
  assert.equal(convsRes.status, 401, "GET /api/panel/conversations debe retornar 401");

  const convMsgRes = await getConvMessages(unauthReq("http://localhost:3000/api/panel/conversations/c1/messages"), dummyParams);
  assert.equal(convMsgRes.status, 401, "GET /api/panel/conversations/[id]/messages debe retornar 401");

  const ordersRes = await getOrders(unauthReq("http://localhost:3000/api/panel/orders"));
  assert.equal(ordersRes.status, 401, "GET /api/panel/orders debe retornar 401");

  const prodRes = await getProducts(unauthReq("http://localhost:3000/api/panel/products"));
  assert.equal(prodRes.status, 401, "GET /api/panel/products debe retornar 401");

  const settingsRes = await getSettings(unauthReq("http://localhost:3000/api/panel/settings"));
  assert.equal(settingsRes.status, 401, "GET /api/panel/settings debe retornar 401");

  const usersRes = await getUsers(unauthReq("http://localhost:3000/api/panel/users"));
  assert.ok([401, 403].includes(usersRes.status), "GET /api/panel/users debe rechazar con 401 o 403");

  const logsRes = await getLogs(unauthReq("http://localhost:3000/api/panel/logs"));
  assert.equal(logsRes.status, 401, "GET /api/panel/logs debe retornar 401");

  const testAiRes = await getTestAi(unauthReq("http://localhost:3000/api/panel/test-ai"));
  assert.equal(testAiRes.status, 401, "GET /api/panel/test-ai debe retornar 401");

  const qrGetRes = await getWhatsAppQr(unauthReq("http://localhost:3000/api/panel/whatsapp-qr"));
  assert.equal(qrGetRes.status, 401, "GET /api/panel/whatsapp-qr debe retornar 401");

  // Controladores de modificación (POST, PUT, PATCH, DELETE) sin cookies
  const patchConvRes = await patchConv(unauthReq("http://localhost:3000/api/panel/conversations/c1", "PATCH", { customerName: "Test" }), dummyParams);
  assert.equal(patchConvRes.status, 401, "PATCH /api/panel/conversations/[id] debe retornar 401");

  const delConvRes = await deleteConv(unauthReq("http://localhost:3000/api/panel/conversations/c1", "DELETE"), dummyParams);
  assert.ok([401, 403].includes(delConvRes.status), "DELETE /api/panel/conversations/[id] debe retornar 401 o 403");

  const postMsgRes = await postConvMessages(unauthReq("http://localhost:3000/api/panel/conversations/c1/messages", "POST", { body: "Hola" }), dummyParams);
  assert.equal(postMsgRes.status, 401, "POST /api/panel/conversations/[id]/messages debe retornar 401");

  const postStatusRes = await postConvStatus(unauthReq("http://localhost:3000/api/panel/conversations/c1/status", "POST", { status: "bot" }), dummyParams);
  assert.equal(postStatusRes.status, 401, "POST /api/panel/conversations/[id]/status debe retornar 401");

  const patchOrderRes = await patchOrder(unauthReq("http://localhost:3000/api/panel/orders/o1", "PATCH", { status: "delivering" }), dummyParams);
  assert.equal(patchOrderRes.status, 401, "PATCH /api/panel/orders/[id] debe retornar 401");

  const delOrderRes = await deleteOrder(unauthReq("http://localhost:3000/api/panel/orders/o1", "DELETE"), dummyParams);
  assert.ok([401, 403].includes(delOrderRes.status), "DELETE /api/panel/orders/[id] debe retornar 401 o 403");

  const notifyRes = await postNotifyDriver(unauthReq("http://localhost:3000/api/panel/orders/o1/notify-driver", "POST"), dummyParams);
  assert.equal(notifyRes.status, 401, "POST /api/panel/orders/[id]/notify-driver debe retornar 401");

  const postProdRes = await postProducts(unauthReq("http://localhost:3000/api/panel/products", "POST", { sku: "X", name: "Y", price: 100 }));
  assert.equal(postProdRes.status, 401, "POST /api/panel/products debe retornar 401");

  const patchProdRes = await patchProduct(unauthReq("http://localhost:3000/api/panel/products/X", "PATCH", { price: 200 }), dummyParams);
  assert.equal(patchProdRes.status, 401, "PATCH /api/panel/products/[sku] debe retornar 401");

  const delProdRes = await deleteProduct(unauthReq("http://localhost:3000/api/panel/products/X", "DELETE"), dummyParams);
  assert.equal(delProdRes.status, 401, "DELETE /api/panel/products/[sku] debe retornar 401");

  const putSettingsRes = await putSettings(unauthReq("http://localhost:3000/api/panel/settings", "PUT", { businessName: "Test" }));
  assert.ok([401, 403].includes(putSettingsRes.status), "PUT /api/panel/settings debe retornar 401 o 403");

  const postSettingsRes = await postSettings(unauthReq("http://localhost:3000/api/panel/settings", "POST", { businessName: "Test" }));
  assert.ok([401, 403].includes(postSettingsRes.status), "POST /api/panel/settings debe retornar 401 o 403");

  const postUserRes = await postUsers(unauthReq("http://localhost:3000/api/panel/users", "POST", { email: "a@b.co", password: "p", name: "n" }));
  assert.ok([401, 403].includes(postUserRes.status), "POST /api/panel/users debe retornar 401 o 403");

  const patchUserRes = await patchUser(unauthReq("http://localhost:3000/api/panel/users/u1", "PATCH", { name: "New Name" }), dummyParams);
  assert.ok([401, 403].includes(patchUserRes.status), "PATCH /api/panel/users/[id] debe retornar 401 o 403");

  const delUserRes = await deleteUserRoute(unauthReq("http://localhost:3000/api/panel/users/u1", "DELETE"), dummyParams);
  assert.ok([401, 403].includes(delUserRes.status), "DELETE /api/panel/users/[id] debe retornar 401 o 403");

  const delLogsRes = await deleteLogs(unauthReq("http://localhost:3000/api/panel/logs", "DELETE"));
  assert.equal(delLogsRes.status, 401, "DELETE /api/panel/logs debe retornar 401");

  const qrPostRes = await postWhatsAppQr(unauthReq("http://localhost:3000/api/panel/whatsapp-qr", "POST", { action: "restart" }));
  assert.equal(qrPostRes.status, 401, "POST /api/panel/whatsapp-qr debe retornar 401");

  // Filtro inicial rápido en Edge Middleware para todas las solicitudes a /api/panel sin cookies
  const sampleEndpoints = [
    "/api/panel/orders",
    "/api/panel/users",
    "/api/panel/conversations",
    "/api/panel/products",
    "/api/panel/settings",
    "/api/panel/logs",
  ];
  for (const endpoint of sampleEndpoints) {
    const midRes = await middleware(new NextRequest(`http://localhost:3000${endpoint}`));
    assert.equal(midRes.status, 401, `Middleware debe retornar 401 para ${endpoint} sin cookies`);
  }
});




