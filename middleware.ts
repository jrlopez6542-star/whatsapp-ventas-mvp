import { NextRequest, NextResponse } from "next/server";

const PANEL_COOKIE = "panel_session";

function getPassword(): string {
  return (process.env.PANEL_PASSWORD || "").trim();
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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const password = getPassword();

  // Sin password: panel abierto (preview warning se muestra en UI)
  if (!password) {
    return NextResponse.next();
  }

  const isLoginPage = pathname === "/panel/login";
  const isLoginApi = pathname === "/api/panel/auth/login";
  const isLogoutApi = pathname === "/api/panel/auth/logout";

  if (isLoginApi || isLogoutApi) {
    return NextResponse.next();
  }

  const token = request.cookies.get(PANEL_COOKIE)?.value;
  const expected = await sessionToken(password);
  const ok = Boolean(token && timingSafeEqualStr(token, expected));

  if (pathname.startsWith("/panel")) {
    if (isLoginPage) {
      if (ok) {
        return NextResponse.redirect(new URL("/panel", request.url));
      }
      return NextResponse.next();
    }
    if (!ok) {
      const login = new URL("/panel/login", request.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/panel")) {
    if (!ok) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/panel/:path*", "/api/panel/:path*"],
};