import { NextRequest, NextResponse } from "next/server";

const PANEL_COOKIE = "panel_session";

function getPassword(): string {
  return (process.env.PANEL_PASSWORD || "").trim().replace(/^"|"$/g, "");
}

function getSigningSecret(): string {
  return (
    getPassword() ||
    (process.env.CRON_SECRET || "").trim().replace(/^"|"$/g, "") ||
    (process.env.EVOLUTION_API_KEY || "").trim().replace(/^"|"$/g, "") ||
    "bunuelandia-secret-panel-signing-key-default-2026"
  );
}

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sessionToken(password: string): Promise<string> {
  return sha256Hex(`whatsapp-ventas-panel:${password}`);
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

async function verifyHmacSessionToken(token: string, secret: string): Promise<boolean> {
  if (!token || !token.includes(".")) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [rawToken, sigHex] = parts;
  if (!rawToken || !sigHex || rawToken.length !== 64 || sigHex.length !== 64) return false;

  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const sigBytes = new Uint8Array(
      sigHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );

    return await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes,
      enc.encode(rawToken)
    );
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isLoginPage = pathname === "/panel/login";
  const isLoginApi = pathname === "/api/panel/auth/login";
  const isLogoutApi = pathname === "/api/panel/auth/logout";

  if (isLoginApi || isLogoutApi) {
    return NextResponse.next();
  }

  const token =
    request.cookies.get("panel_session")?.value?.trim() ||
    request.cookies.get("crm_session")?.value?.trim();
  const password = getPassword();

  // Verificación estricta del token de sesión:
  // 1. Token legado derivado de PANEL_PASSWORD (tiempo constante)
  // 2. Token firmado criptográficamente con HMAC-SHA256 (previene tokens inventados)
  let hasValidToken = false;
  if (token && token.length >= 32) {
    if (password) {
      const expectedLegacy = await sessionToken(password);
      if (timingSafeEqualStr(token, expectedLegacy)) {
        hasValidToken = true;
      }
    }
    if (!hasValidToken && token.includes(".")) {
      const secret = getSigningSecret();
      if (await verifyHmacSessionToken(token, secret)) {
        hasValidToken = true;
      }
    }
  }

  if (pathname.startsWith("/panel")) {
    if (isLoginPage) {
      // Si el usuario acaba de solicitar logout explícito, no auto-redirigir a /panel
      const isExplicitLogout = request.nextUrl.searchParams.has("logout");
      if (hasValidToken && !isExplicitLogout) {
        return NextResponse.redirect(new URL("/panel", request.url));
      }
      return NextResponse.next();
    }
    if (!hasValidToken) {
      const login = new URL("/panel/login", request.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/panel")) {
    if (!hasValidToken) {
      return NextResponse.json(
        { ok: false, error: "No autorizado. Inicie sesión en el panel." },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/panel/:path*", "/api/panel/:path*"],
};