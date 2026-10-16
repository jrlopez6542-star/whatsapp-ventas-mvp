import { createHash, createHmac, timingSafeEqual, randomBytes, randomUUID } from "crypto";
import type { NextRequest } from "next/server";
import { ensureTursoReady, getTursoClient, isTursoConfigured } from "@/lib/store/db";
import { hashPassword } from "./passwords";

export type UserRole = "admin" | "operator" | "driver";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface UserWithPassword extends User {
  passwordHash: string;
}

export interface SessionUser extends User {
  sessionId: string;
  expiresAt: number;
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

// --- Almacén en Memoria para pruebas o entornos sin Turso ---
interface MemoryUserRecord {
  user: UserWithPassword;
}
interface MemorySessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: number;
  userAgent?: string;
  ipAddress?: string;
  createdAt: number;
}

class MemoryAuthStore {
  users = new Map<string, MemoryUserRecord>();
  sessions = new Map<string, MemorySessionRecord>();
}

declare global {
  var __memoryAuthStore: MemoryAuthStore | undefined;
}

function getMemoryAuthStore(): MemoryAuthStore {
  if (!globalThis.__memoryAuthStore) {
    globalThis.__memoryAuthStore = new MemoryAuthStore();
  }
  return globalThis.__memoryAuthStore;
}

export function getSessionSigningSecret(): string {
  const secret =
    (process.env.PANEL_PASSWORD || "").trim().replace(/^"|"$/g, "") ||
    (process.env.CRON_SECRET || "").trim().replace(/^"|"$/g, "") ||
    (process.env.EVOLUTION_API_KEY || "").trim().replace(/^"|"$/g, "") ||
    "bunuelandia-secret-panel-signing-key-default-2026";
  return secret;
}

export function signToken(rawToken: string): string {
  const secret = getSessionSigningSecret();
  const signature = createHmac("sha256", secret).update(rawToken).digest("hex");
  return `${rawToken}.${signature}`;
}

export function verifySignedToken(signedToken: string): string | null {
  if (!signedToken || typeof signedToken !== "string" || !signedToken.includes(".")) {
    return null;
  }
  const parts = signedToken.split(".");
  if (parts.length !== 2) return null;
  const [rawToken, sig] = parts;
  if (!rawToken || !sig || rawToken.length !== 64 || sig.length !== 64) {
    return null;
  }
  const secret = getSessionSigningSecret();
  const expectedSig = createHmac("sha256", secret).update(rawToken).digest("hex");
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expectedSig, "hex");
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return rawToken;
    }
  } catch {
    return null;
  }
  return null;
}

export function extractRawToken(token: string): string {
  const trimmed = (token || "").trim();
  if (trimmed.includes(".")) {
    const verified = verifySignedToken(trimmed);
    if (verified) return verified;
  }
  return trimmed;
}

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken.trim()).digest("hex");
}

export function normalizeEmail(email: string): string {
  return (email || "").trim().toLowerCase();
}

/**
 * Busca un usuario por correo electrónico (incluye password_hash para autenticación)
 */
export async function findUserByEmail(email: string): Promise<UserWithPassword | null> {
  const norm = normalizeEmail(email);
  if (!norm) return null;

  if (!isTursoConfigured()) {
    const mem = getMemoryAuthStore();
    for (const record of mem.users.values()) {
      if (normalizeEmail(record.user.email) === norm) {
        return { ...record.user };
      }
    }
    return null;
  }

  try {
    await ensureTursoReady();
    const client = getTursoClient();
    const res = await client.execute({
      sql: `SELECT id, email, password_hash, role, name, phone, active, created_at, updated_at
            FROM users WHERE lower(email) = lower(?) LIMIT 1`,
      args: [norm],
    });

    if (res.rows.length === 0) return null;
    const r: any = res.rows[0];
    return {
      id: String(r.id),
      email: String(r.email),
      passwordHash: String(r.password_hash),
      role: (r.role as UserRole) || "operator",
      name: String(r.name || "Usuario"),
      phone: r.phone ? String(r.phone) : undefined,
      active: Number(r.active) === 1,
      createdAt: Number(r.created_at || 0),
      updatedAt: Number(r.updated_at || 0),
    };
  } catch (err) {
    console.error("[auth] findUserByEmail Turso error:", err);
    return null;
  }
}

/**
 * Busca un usuario por ID (sin password_hash)
 */
export async function findUserById(id: string): Promise<User | null> {
  if (!id) return null;

  if (!isTursoConfigured()) {
    const record = getMemoryAuthStore().users.get(id);
    if (!record) return null;
    const { passwordHash: _, ...safeUser } = record.user;
    return safeUser;
  }

  try {
    await ensureTursoReady();
    const client = getTursoClient();
    const res = await client.execute({
      sql: `SELECT id, email, role, name, phone, active, created_at, updated_at
            FROM users WHERE id = ? LIMIT 1`,
      args: [id],
    });

    if (res.rows.length === 0) return null;
    const r: any = res.rows[0];
    return {
      id: String(r.id),
      email: String(r.email),
      role: (r.role as UserRole) || "operator",
      name: String(r.name || "Usuario"),
      phone: r.phone ? String(r.phone) : undefined,
      active: Number(r.active) === 1,
      createdAt: Number(r.created_at || 0),
      updatedAt: Number(r.updated_at || 0),
    };
  } catch (err) {
    console.error("[auth] findUserById Turso error:", err);
    return null;
  }
}

/**
 * Lista todos los usuarios registrados (excluye hashes de contraseñas)
 */
export async function listAllUsers(): Promise<User[]> {
  if (!isTursoConfigured()) {
    return Array.from(getMemoryAuthStore().users.values()).map((r) => {
      const { passwordHash: _, ...safeUser } = r.user;
      return safeUser;
    });
  }

  try {
    await ensureTursoReady();
    const client = getTursoClient();
    const res = await client.execute(
      `SELECT id, email, role, name, phone, active, created_at, updated_at
       FROM users ORDER BY created_at ASC`
    );

    return res.rows.map((r: any) => ({
      id: String(r.id),
      email: String(r.email),
      role: (r.role as UserRole) || "operator",
      name: String(r.name || "Usuario"),
      phone: r.phone ? String(r.phone) : undefined,
      active: Number(r.active) === 1,
      createdAt: Number(r.created_at || 0),
      updatedAt: Number(r.updated_at || 0),
    }));
  } catch (err) {
    console.error("[auth] listAllUsers Turso error:", err);
    return [];
  }
}

/**
 * Crea un nuevo usuario con contraseña hasheada
 */
export async function createUser(params: {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  phone?: string;
}): Promise<User> {
  const normEmail = normalizeEmail(params.email);
  if (!normEmail || !normEmail.includes("@")) {
    throw new Error("El correo electrónico no es válido");
  }
  if (!params.password || params.password.length < 6) {
    throw new Error("La contraseña debe tener al menos 6 caracteres");
  }
  if (!params.name?.trim()) {
    throw new Error("El nombre es requerido");
  }

  const existing = await findUserByEmail(normEmail);
  if (existing) {
    throw new Error("Ya existe un usuario con este correo electrónico");
  }

  const id = `usr_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const passwordHash = await hashPassword(params.password);
  const now = Date.now();

  const userWithPass: UserWithPassword = {
    id,
    email: normEmail,
    passwordHash,
    role: params.role || "operator",
    name: params.name.trim(),
    phone: params.phone?.trim() || undefined,
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  if (!isTursoConfigured()) {
    getMemoryAuthStore().users.set(id, { user: userWithPass });
  } else {
    try {
      await ensureTursoReady();
      const client = getTursoClient();
      await client.execute({
        sql: `INSERT INTO users (id, email, password_hash, role, name, phone, active, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id,
          normEmail,
          passwordHash,
          userWithPass.role,
          userWithPass.name,
          userWithPass.phone || null,
          1,
          now,
          now,
        ],
      });
    } catch (err) {
      console.error("[auth] createUser Turso error:", err);
      throw err;
    }
  }

  const { passwordHash: _, ...safeUser } = userWithPass;
  return safeUser;
}

/**
 * Actualiza los datos o contraseña de un usuario existente
 */
export async function updateUser(
  id: string,
  updates: {
    name?: string;
    role?: UserRole;
    active?: boolean;
    phone?: string;
    password?: string;
  }
): Promise<User | null> {
  const current = await findUserById(id);
  if (!current) return null;

  const now = Date.now();
  const nextName = updates.name !== undefined ? updates.name.trim() : current.name;
  const nextRole = updates.role !== undefined ? updates.role : current.role;
  const nextActive = updates.active !== undefined ? updates.active : current.active;
  const nextPhone = updates.phone !== undefined ? updates.phone.trim() : current.phone;
  let nextPasswordHash: string | null = null;

  if (updates.password && updates.password.trim()) {
    if (updates.password.trim().length < 6) {
      throw new Error("La nueva contraseña debe tener al menos 6 caracteres");
    }
    nextPasswordHash = await hashPassword(updates.password.trim());
  }

  if (!isTursoConfigured()) {
    const mem = getMemoryAuthStore();
    const record = mem.users.get(id);
    if (record) {
      record.user.name = nextName;
      record.user.role = nextRole;
      record.user.active = nextActive;
      record.user.phone = nextPhone || undefined;
      record.user.updatedAt = now;
      if (nextPasswordHash) {
        record.user.passwordHash = nextPasswordHash;
        await revokeAllUserSessions(id);
      }
    }
  } else {
    try {
      await ensureTursoReady();
      const client = getTursoClient();
      if (nextPasswordHash) {
        await client.execute({
          sql: `UPDATE users SET name = ?, role = ?, active = ?, phone = ?, password_hash = ?, updated_at = ?
                WHERE id = ?`,
          args: [nextName, nextRole, nextActive ? 1 : 0, nextPhone || null, nextPasswordHash, now, id],
        });
        // Si cambió la contraseña, invalidar sesiones anteriores
        await revokeAllUserSessions(id);
      } else {
        await client.execute({
          sql: `UPDATE users SET name = ?, role = ?, active = ?, phone = ?, updated_at = ?
                WHERE id = ?`,
          args: [nextName, nextRole, nextActive ? 1 : 0, nextPhone || null, now, id],
        });
      }
    } catch (err) {
      console.error("[auth] updateUser Turso error:", err);
      throw err;
    }
  }

  return {
    ...current,
    name: nextName,
    role: nextRole,
    active: nextActive,
    phone: nextPhone || undefined,
    updatedAt: now,
  };
}

/**
 * Desactiva o elimina un usuario
 */
export async function deleteUser(id: string): Promise<boolean> {
  if (!id) return false;

  await revokeAllUserSessions(id);

  if (!isTursoConfigured()) {
    return getMemoryAuthStore().users.delete(id);
  }

  try {
    await ensureTursoReady();
    const client = getTursoClient();
    const res = await client.execute({
      sql: `DELETE FROM users WHERE id = ?`,
      args: [id],
    });
    return Number(res.rowsAffected || 0) > 0;
  } catch (err) {
    console.error("[auth] deleteUser Turso error:", err);
    return false;
  }
}

/**
 * Crea una sesión criptográficamente segura para un usuario.
 * Retorna token firmado (rawToken.hmac) para el cliente y rawToken para almacenamiento.
 */
export async function createSession(
  userId: string,
  userAgent?: string,
  ipAddress?: string
): Promise<{ token: string; rawToken: string; expiresAt: number }> {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const id = `ses_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  if (!isTursoConfigured()) {
    getMemoryAuthStore().sessions.set(tokenHash, {
      id,
      userId,
      tokenHash,
      expiresAt,
      userAgent,
      ipAddress,
      createdAt: now,
    });
  } else {
    try {
      await ensureTursoReady();
      const client = getTursoClient();
      await client.execute({
        sql: `INSERT INTO user_sessions (id, user_id, token_hash, expires_at, user_agent, ip_address, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          id,
          userId,
          tokenHash,
          expiresAt,
          userAgent ? userAgent.slice(0, 255) : null,
          ipAddress ? ipAddress.slice(0, 64) : null,
          now,
        ],
      });
    } catch (err) {
      console.error("[auth] createSession Turso error:", err);
      throw err;
    }
  }

  const signedToken = signToken(rawToken);
  return { token: signedToken, rawToken, expiresAt };
}

/**
 * Valida un token de sesión (acepta token firmado raw.sig o token crudo) y retorna el usuario activo
 */
export async function validateSession(tokenInput: string): Promise<SessionUser | null> {
  if (!tokenInput || typeof tokenInput !== "string") {
    return null;
  }

  const rawToken = extractRawToken(tokenInput);
  if (!rawToken || rawToken.length < 32) {
    return null;
  }

  const tokenHash = hashToken(rawToken);
  const directHash = hashToken(tokenInput);
  if (await isTokenRevoked(tokenHash) || await isTokenRevoked(directHash)) {
    return null;
  }
  const now = Date.now();

  if (!isTursoConfigured()) {
    const memSession = getMemoryAuthStore().sessions.get(tokenHash);
    if (!memSession || memSession.expiresAt <= now) {
      if (memSession) getMemoryAuthStore().sessions.delete(tokenHash);
      return null;
    }
    const memUserRecord = getMemoryAuthStore().users.get(memSession.userId);
    if (!memUserRecord || !memUserRecord.user.active) return null;

    const { passwordHash: _, ...safeUser } = memUserRecord.user;
    return {
      ...safeUser,
      sessionId: memSession.id,
      expiresAt: memSession.expiresAt,
    };
  }

  try {
    await ensureTursoReady();
    const client = getTursoClient();
    const res = await client.execute({
      sql: `SELECT s.id as session_id, s.expires_at,
                   u.id, u.email, u.name, u.role, u.phone, u.active, u.created_at, u.updated_at
            FROM user_sessions s
            INNER JOIN users u ON s.user_id = u.id
            WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1
            LIMIT 1`,
      args: [tokenHash, now],
    });

    if (res.rows.length === 0) return null;
    const r: any = res.rows[0];

    return {
      id: String(r.id),
      email: String(r.email),
      name: String(r.name || "Usuario"),
      role: (r.role as UserRole) || "operator",
      phone: r.phone ? String(r.phone) : undefined,
      active: Number(r.active) === 1,
      createdAt: Number(r.created_at || 0),
      updatedAt: Number(r.updated_at || 0),
      sessionId: String(r.session_id),
      expiresAt: Number(r.expires_at),
    };
  } catch (err) {
    console.error("[auth] validateSession Turso error:", err);
    return null;
  }
}

const memoryRevokedTokens = new Set<string>();

export async function isTokenRevoked(tokenHash: string): Promise<boolean> {
  if (memoryRevokedTokens.has(tokenHash)) return true;
  if (!isTursoConfigured()) return false;
  try {
    await ensureTursoReady();
    const client = getTursoClient();
    const res = await client.execute({
      sql: `SELECT 1 FROM revoked_tokens WHERE token_hash = ? LIMIT 1`,
      args: [tokenHash],
    });
    return res.rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * Revoca una sesión específica por su token crudo o firmado
 */
export async function revokeSession(tokenInput: string): Promise<void> {
  if (!tokenInput) return;
  const rawToken = extractRawToken(tokenInput);
  const tokenHash = hashToken(rawToken);
  const directHash = hashToken(tokenInput);

  memoryRevokedTokens.add(tokenHash);
  memoryRevokedTokens.add(directHash);

  if (!isTursoConfigured()) {
    getMemoryAuthStore().sessions.delete(tokenHash);
    return;
  }

  try {
    await ensureTursoReady();
    const client = getTursoClient();
    await client.batch([
      {
        sql: `DELETE FROM user_sessions WHERE token_hash = ?`,
        args: [tokenHash],
      },
      {
        sql: `INSERT OR REPLACE INTO revoked_tokens (token_hash, revoked_at) VALUES (?, ?)`,
        args: [tokenHash, Date.now()],
      },
      {
        sql: `INSERT OR REPLACE INTO revoked_tokens (token_hash, revoked_at) VALUES (?, ?)`,
        args: [directHash, Date.now()],
      },
    ], "write");
  } catch (err) {
    console.error("[auth] revokeSession Turso error:", err);
  }
}

/**
 * Validador estricto de autenticación para endpoints API del panel.
 * Verifica cookie de sesión multiusuario o token derivado de PANEL_PASSWORD.
 */
export async function requirePanelAuth(
  request: NextRequest,
  allowedRoles?: UserRole[]
): Promise<{ authorized: boolean; user?: SessionUser | null; error?: string }> {
  const token =
    request.cookies.get("panel_session")?.value?.trim() ||
    request.cookies.get("crm_session")?.value?.trim();
  if (!token) {
    return { authorized: false, error: "No autorizado. Inicie sesión en el panel." };
  }

  // Comprobar si el token fue explícitamente revocado
  const rawToken = extractRawToken(token);
  const tokenHash = hashToken(rawToken);
  const directHash = hashToken(token);
  if (await isTokenRevoked(tokenHash) || await isTokenRevoked(directHash)) {
    return { authorized: false, error: "Sesión revocada. Inicie sesión nuevamente." };
  }

  // 1. Validar sesión multiusuario en base de datos o almacén
  const user = await validateSession(token);
  if (user) {
    if (allowedRoles && !allowedRoles.includes(user.role)) {
      return { authorized: false, error: "Acceso denegado: permisos insuficientes." };
    }
    return { authorized: true, user };
  }

  // 2. Compatibilidad con contraseña legacy del entorno
  const envPassword = (process.env.PANEL_PASSWORD || "").trim().replace(/^"|"$/g, "");
  if (envPassword) {
    const expectedLegacy = createHash("sha256").update(`whatsapp-ventas-panel:${envPassword}`).digest("hex");
    if (token === expectedLegacy) {
      return {
        authorized: true,
        user: {
          id: "legacy_admin",
          email: "admin@bunuelandia.co",
          name: "Administrador Legacy",
          role: "admin",
          active: true,
          createdAt: 0,
          updatedAt: 0,
          sessionId: "legacy_session",
          expiresAt: Date.now() + 86400000,
        },
      };
    }
  }

  return { authorized: false, error: "Sesión inválida o expirada." };
}

/**
 * Revoca todas las sesiones activas de un usuario
 */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  if (!userId) return;

  if (!isTursoConfigured()) {
    const mem = getMemoryAuthStore();
    for (const [key, s] of mem.sessions.entries()) {
      if (s.userId === userId) mem.sessions.delete(key);
    }
    return;
  }

  try {
    await ensureTursoReady();
    const client = getTursoClient();
    await client.execute({
      sql: `DELETE FROM user_sessions WHERE user_id = ?`,
      args: [userId],
    });
  } catch (err) {
    console.error("[auth] revokeAllUserSessions Turso error:", err);
  }
}

/**
 * Asegura la creación del Administrador Inicial si la base de datos no tiene usuarios.
 * Utiliza PANEL_PASSWORD de forma segura sin imprimirla en logs ni almacenarla en texto plano.
 */
export async function ensureInitialAdmin(): Promise<void> {
  try {
    const users = await listAllUsers();
    if (users.length > 0) {
      return; // Ya existen usuarios configurados
    }

    const envPassword = (process.env.PANEL_PASSWORD || "").trim().replace(/^"|"$/g, "");
    if (!envPassword) {
      console.warn("[auth] No hay usuarios registrados y PANEL_PASSWORD no está definida.");
      return;
    }

    const adminEmail = (process.env.ADMIN_INITIAL_EMAIL || "admin@bunuelandia.co").trim().toLowerCase();
    await createUser({
      email: adminEmail,
      password: envPassword,
      name: "Administrador Principal",
      role: "admin",
      phone: "3228964947",
    });

    console.log(`[auth] Administrador inicial configurado con éxito (${adminEmail}).`);
  } catch (err) {
    console.error("[auth] ensureInitialAdmin error:", err);
  }
}
