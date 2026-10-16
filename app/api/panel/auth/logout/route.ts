import { NextRequest, NextResponse } from "next/server";
import { revokeSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const panelCookie = request.cookies.get("panel_session")?.value;
  const crmCookie = request.cookies.get("crm_session")?.value;

  const rawTokens = [panelCookie, crmCookie]
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .map((t) => t.trim());

  // Revocar todos los tokens únicos presentes en las cookies
  const uniqueTokens = Array.from(new Set(rawTokens));

  if (uniqueTokens.length > 0) {
    try {
      for (const token of uniqueTokens) {
        await revokeSession(token);
      }
    } catch {
      // Registrar el fallo de forma segura sin exponer tokens ni secretos
      console.error("[auth] Logout error: fallo al revocar sesiones en el almacén del servidor");
      return NextResponse.json(
        { ok: false, error: "Error al revocar la sesión en el servidor" },
        { status: 500 }
      );
    }
  }

  const response = NextResponse.json({ ok: true });

  const expireCookieOptions = {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    expires: new Date(0),
  };

  response.cookies.set("panel_session", "", expireCookieOptions);
  response.cookies.set("crm_session", "", expireCookieOptions);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");

  return response;
}

