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
