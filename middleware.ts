import { NextRequest, NextResponse } from "next/server";

function getSigningSecret(): string | null {
  const secret = (process.env.PANEL_SESSION_SECRET || "").trim().replace(/^"|"$/g, "");

  if (process.env.NODE_ENV === "production") {
    if (!secret) {
      console.error("[security] Falta secreto de firma de sesión en producción (PANEL_SESSION_SECRET). Fallando de forma segura.");
      return null;
    }
    return secret;
  }

  // En desarrollo/pruebas locales, usar secreto configurado o clave local fija no productiva
  return secret || "dev-local-secret-panel-signing-key-only-not-for-prod";
}

async function verifyHmacSessionToken(token: string, secret: string | null): Promise<boolean> {
  if (!secret) return false;
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

  const panelCookie = request.cookies.get("panel_session")?.value?.trim();
  const crmCookie = request.cookies.get("crm_session")?.value?.trim();

  // Verificación de primer nivel en Edge: formato y firma criptográfica HMAC-SHA256
  // La autorización definitiva (expiración, usuario activo y revocación en Turso) se realiza en el servidor
  const secret = getSigningSecret();
  let hasValidFormat = false;

  if (secret) {
    if (panelCookie && crmCookie) {
      const validPanel = await verifyHmacSessionToken(panelCookie, secret);
      const validCrm = await verifyHmacSessionToken(crmCookie, secret);
      hasValidFormat = validPanel && validCrm;
    } else if (panelCookie) {
      hasValidFormat = await verifyHmacSessionToken(panelCookie, secret);
    } else if (crmCookie) {
      hasValidFormat = await verifyHmacSessionToken(crmCookie, secret);
    }
  }

  if (pathname.startsWith("/panel")) {
    if (isLoginPage) {
      // Si el usuario acaba de solicitar logout explícito, no auto-redirigir a /panel
      const isExplicitLogout = request.nextUrl.searchParams.has("logout");
      if (hasValidFormat && !isExplicitLogout) {
        return NextResponse.redirect(new URL("/panel", request.url));
      }
      return NextResponse.next();
    }
    if (!hasValidFormat) {
      const login = new URL("/panel/login", request.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/panel")) {
    if (!hasValidFormat) {
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