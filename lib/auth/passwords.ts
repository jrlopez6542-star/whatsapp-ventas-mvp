import { randomBytes, scrypt, timingSafeEqual } from "crypto";

const SCRYPT_PREFIX = "$scrypt$N=16384,r=8,p=1$";
const KEY_LEN = 64;
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;

function deriveScryptKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LEN,
      {
        N: COST,
        r: BLOCK_SIZE,
        p: PARALLELISM,
        maxmem: 32 * 1024 * 1024,
      },
      (err, derivedKey) => {
        if (err) return reject(err);
        resolve(derivedKey as Buffer);
      }
    );
  });
}

/**
 * Genera un hash criptográfico robusto y salado usando scrypt (NIST / OWASP).
 * No requiere paquetes externos compilados por node-gyp, garantizando compatibilidad en Vercel.
 */
export async function hashPassword(password: string): Promise<string> {
  const normalized = (password || "").trim();
  if (!normalized) {
    throw new Error("La contraseña no puede estar vacía");
  }

  const salt = randomBytes(32);
  const derivedKey = await deriveScryptKey(normalized, salt);

  return `${SCRYPT_PREFIX}${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

/**
 * Compara en tiempo constante la contraseña provista contra el hash guardado.
 * Es inmune a ataques de canal lateral (timing attacks).
 */
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  if (!password || !storedHash) return false;
  const input = password.trim();

  // 1. Formato scrypt estándar
  if (storedHash.startsWith(SCRYPT_PREFIX)) {
    try {
      const parts = storedHash.slice(SCRYPT_PREFIX.length).split("$");
      if (parts.length !== 2) return false;

      const [saltHex, keyHex] = parts;
      const salt = Buffer.from(saltHex, "hex");
      const expectedKey = Buffer.from(keyHex, "hex");

      const derivedKey = await deriveScryptKey(input, salt);

      if (derivedKey.length !== expectedKey.length) return false;
      return timingSafeEqual(derivedKey, expectedKey);
    } catch {
      return false;
    }
  }

  // 2. Soporte para migración de hash SHA-256 legado
  if (storedHash.startsWith("sha256:")) {
    const rawExpected = storedHash.slice("sha256:".length);
    const { createHash } = await import("crypto");
    const inputHash = createHash("sha256").update(input).digest("hex");
    const bufA = Buffer.from(inputHash, "utf-8");
    const bufB = Buffer.from(rawExpected, "utf-8");
    return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
  }

  return false;
}
