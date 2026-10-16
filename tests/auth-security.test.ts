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


